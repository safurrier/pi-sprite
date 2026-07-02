import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { SpriteBubblePlacement } from "../ui/overlay.ts";
import { registerSpriteCommands, type SpriteCommandRuntime } from "./commands.ts";
import { downloadToBuffer } from "./download.ts";
import { formatLiveStatusFooter, type LiveTurnStatus } from "./live-status-format.ts";
import { importPetZip, loadPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";
import { spriteHome, statePath } from "./paths.ts";

import {
	buildKittyPlaceholderSpriteWidget,
	buildNativeSpriteWidget,
	clearAllNativeSpriteImages,
	clearNativeSpriteImages,
	clearSpriteTerminalGraphicsCaches,
	formatNativeSpritePlaceholderLines,
	formatTextSpriteLines,
	renderSpriteAnimation,
	type SpriteAlign,
	type SpriteRenderOptions,
	type SpriteSize,
	supportsNativeSpriteImages,
	usesKittyPlaceholderSpriteImages,
} from "./renderer.ts";
import { formatTurnStatusFooter, type TurnStatus } from "./turn-status-format.ts";

type ActivityStatus = "idle" | "running" | "ready" | "error";

interface SavedState {
	selectedPetId?: string;
	visible?: boolean;
	size?: SpriteSize;
	label?: boolean;
	align?: SpriteAlign;
	turnStatusEnabled?: boolean;
	turnStatusConfigured?: boolean;
	liveStatusEnabled?: boolean;
	liveStatusConfigured?: boolean;
}

interface CompanionActivity {
	btwCount: number;
	btwStatus: ActivityStatus;
	recapStatus: ActivityStatus;
}

const DEFAULT_FRAMES: Record<SpriteState, string> = {
	idle: "  ◕‿◕  ",
	thinking: "  ◔_◔  ",
	working: "  ◕_◕⌨ ",
	success: "  ◕‿◕✦ ",
	error: "  ◕︵◕  ",
};

const DEFAULT_SIZE: SpriteSize = "small";
const DEFAULT_ALIGN: SpriteAlign = "right";
const DEFAULT_LABEL = false;
const DEFAULT_TURN_STATUS_ENABLED = true;
const DEFAULT_LIVE_STATUS_ENABLED = true;

function loadSaved(): SavedState {
	try {
		return JSON.parse(readFileSync(statePath(), "utf8")) as SavedState;
	} catch {
		return {};
	}
}
function saveSaved(state: SavedState): void {
	mkdirSync(spriteHome(), { recursive: true });
	writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

function nativeImageIdFromSeed(seed: string, mask = 0x7ffffffe): number {
	const digest = createHash("sha1").update(seed).digest();
	return digest.readUInt32BE(0) & mask || 1;
}

export function stableNativeImageId(): number {
	const paneOrCwd = process.env.TMUX_PANE ? `pane:${process.env.TMUX_PANE}` : `cwd:${process.cwd()}`;
	return nativeImageIdFromSeed(["pi-sprite", paneOrCwd].join(":"));
}

function legacyNativeImageId(): number {
	const legacySeed = ["pi-sprite", process.env.TMUX_PANE ?? "no-pane", process.cwd()].join(":");
	return nativeImageIdFromSeed(legacySeed, 0x7fffffff);
}

export function nativeSpriteCleanupImageIds(count = 16): number[] {
	const imageId = stableNativeImageId();
	const frameIds = Array.from({ length: Math.max(2, count) }, (_unused, index) => imageId + index);
	return Array.from(new Set([...frameIds, legacyNativeImageId()]));
}

export function createSpriteRuntime() {
	let ctx: ExtensionContext | undefined;
	let state: SpriteState = "idle";
	let selectedPetId = "";
	let visible = true;
	let size: SpriteSize = DEFAULT_SIZE;
	let label = DEFAULT_LABEL;
	let align: SpriteAlign = DEFAULT_ALIGN;
	let turnStatusEnabled = DEFAULT_TURN_STATUS_ENABLED;
	let turnStatusConfigured = false;
	let turnStatus: TurnStatus | "pending" | undefined;
	let liveStatusEnabled = DEFAULT_LIVE_STATUS_ENABLED;
	let liveStatusConfigured = false;
	let liveStatus: LiveTurnStatus | "pending" | undefined;
	let liveStatusGeneration = 0;
	let activity: CompanionActivity = { btwCount: 0, btwStatus: "idle", recapStatus: "idle" };
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	let clearWidgetTimer: ReturnType<typeof setTimeout> | undefined;
	let animationTimer: ReturnType<typeof setInterval> | undefined;
	let lastSignature = "";
	let renderGeneration = 0;
	let frameIndex = 0;
	let previousNativeFrameImageId: number | undefined;
	let clearedStaleNativeImages = false;
	let trackedNativeImageIds = nativeSpriteCleanupImageIds();

	function currentNativeImageIds(count = 2): number[] {
		const ids = nativeSpriteCleanupImageIds(count);
		trackedNativeImageIds = Array.from(new Set([...trackedNativeImageIds, ...ids]));
		return ids;
	}

	function clearTrackedNativeSpriteImages(): string[] {
		const currentIds = nativeSpriteCleanupImageIds();
		const ids = Array.from(new Set([...trackedNativeImageIds, ...currentIds]));
		trackedNativeImageIds = currentIds;
		clearSpriteTerminalGraphicsCaches();
		return clearNativeSpriteImages(ids);
	}

	function selectedName(): string {
		return selectedPetId ? (loadPet(selectedPetId)?.manifest.name ?? selectedPetId) : "default";
	}

	function selectedPersonality(): string | undefined {
		return selectedPetId ? loadPet(selectedPetId)?.manifest.personality : undefined;
	}

	function renderOptions(): SpriteRenderOptions {
		return { size, label, align };
	}

	function defaultLines(): string[] {
		const lines = [DEFAULT_FRAMES[state]];
		if (label) lines.push(`pi-sprite · ${state}`);
		return lines;
	}

	function updateFooter(currentCtx = ctx): void {
		if (!currentCtx?.hasUI) return;
		if (!visible) {
			currentCtx.ui.setStatus("pi-sprite", undefined);
			return;
		}
		const parts = [`🐾 ${selectedName()} ${state}`];
		if (liveStatusEnabled && liveStatus) {
			parts.push(liveStatus === "pending" ? "live…" : formatLiveStatusFooter(liveStatus));
		}
		if (turnStatusEnabled && turnStatus) {
			parts.push(turnStatus === "pending" ? "status…" : formatTurnStatusFooter(turnStatus));
		}
		currentCtx.ui.setStatus("pi-sprite", parts.join(" · "));
	}

	function spriteBubbleBottomMargin(): number {
		const base = { tiny: 4, small: 6, medium: 8, large: 10 }[size];
		return base + (label ? 1 : 0);
	}

	function bubblePlacement(): SpriteBubblePlacement {
		if (!visible) return { anchor: "center", tail: "none", margin: {} };
		if (align === "left")
			return { anchor: "bottom-left", tail: "bottom-left", margin: { left: 2, bottom: spriteBubbleBottomMargin() } };
		return { anchor: "bottom-right", tail: "bottom-right", margin: { right: 2, bottom: spriteBubbleBottomMargin() } };
	}

	function stopAnimation(): void {
		if (animationTimer) clearInterval(animationTimer);
		animationTimer = undefined;
	}

	function clearNativeWidget(
		currentCtx: ExtensionContext,
		options: { removeAfter?: boolean; requireCurrentContext?: boolean; trackTimer?: boolean } = {},
	): void {
		if (clearWidgetTimer) clearTimeout(clearWidgetTimer);
		previousNativeFrameImageId = undefined;
		const clearLines = clearTrackedNativeSpriteImages();
		if (!clearLines.length) {
			currentCtx.ui.setWidget("pi-sprite", undefined, { placement: "belowEditor" });
			return;
		}
		currentCtx.ui.setWidget("pi-sprite", clearLines, { placement: "belowEditor" });
		if (options.removeAfter === false) return;
		const timer = setTimeout(() => {
			if (options.requireCurrentContext === false || ctx === currentCtx) {
				currentCtx.ui.setWidget("pi-sprite", undefined, { placement: "belowEditor" });
			}
		}, 50);
		if (options.trackTimer !== false) clearWidgetTimer = timer;
	}

	function render(): void {
		if (!ctx?.hasUI) return;
		const currentCtx = ctx;
		updateFooter(currentCtx);
		let startupClearLines: string[] = [];
		if (!clearedStaleNativeImages) {
			clearedStaleNativeImages = true;
			previousNativeFrameImageId = undefined;
			startupClearLines = clearTrackedNativeSpriteImages();
		}
		const withStartupClear = (lines: string[]): string[] =>
			startupClearLines.length ? [...startupClearLines, ...lines] : lines;
		if (!visible) {
			stopAnimation();
			clearNativeWidget(currentCtx);
			lastSignature = "hidden";
			return;
		}
		if (clearWidgetTimer) clearTimeout(clearWidgetTimer);
		clearWidgetTimer = undefined;
		const generation = ++renderGeneration;
		const pet = selectedPetId ? loadPet(selectedPetId) : undefined;
		if (!pet) {
			const lines = defaultLines();
			const signature = lines.join("\n");
			if (signature === lastSignature && !startupClearLines.length) return;
			lastSignature = signature;
			currentCtx.ui.setWidget("pi-sprite", formatTextSpriteLines(withStartupClear(lines), renderOptions()), {
				placement: "belowEditor",
			});
			return;
		}
		const spritePath = pet.manifest.sprites[state] ?? pet.manifest.sprites.idle;
		lastSignature = `loading:${pet.id}:${state}:${spritePath ?? ""}`;
		if (supportsNativeSpriteImages()) {
			currentCtx.ui.setWidget("pi-sprite", formatNativeSpritePlaceholderLines(startupClearLines, renderOptions()), {
				placement: "belowEditor",
			});
		} else {
			const loadingLines = [`  ◕‿◕  ${pet.manifest.name}`];
			if (label) loadingLines.push(`pi-sprite · loading ${state}${spritePath ? ` · ${basename(spritePath)}` : ""}`);
			currentCtx.ui.setWidget("pi-sprite", formatTextSpriteLines(withStartupClear(loadingLines), renderOptions()), {
				placement: "belowEditor",
			});
		}
		void renderSpriteAnimation(pet, state, renderOptions()).then((animation) => {
			if (generation !== renderGeneration || !visible || ctx !== currentCtx) return;
			stopAnimation();
			frameIndex = 0;
			const applyFrame = () => {
				const frame = animation.frames[frameIndex % animation.frames.length]!;
				const nativeFrames = animation.frames.map((candidate) => candidate.native);
				const hasNativeFrames = nativeFrames.every(Boolean);
				const activeNativeImageIds = currentNativeImageIds(animation.frames.length);
				const nativeMode = usesKittyPlaceholderSpriteImages()
					? "placeholder"
					: supportsNativeSpriteImages()
						? "native"
						: "ansi";
				const frameSignature = `${animation.signature}:${frameIndex % animation.frames.length}:${nativeMode}:${size}:${label}:${align}`;
				if (frameSignature === lastSignature) return;
				lastSignature = frameSignature;
				if (hasNativeFrames && usesKittyPlaceholderSpriteImages()) {
					previousNativeFrameImageId = undefined;
					currentCtx.ui.setWidget(
						"pi-sprite",
						() =>
							buildKittyPlaceholderSpriteWidget(
								nativeFrames as NonNullable<(typeof nativeFrames)[number]>[],
								frameIndex % animation.frames.length,
								`pi-sprite · ${state} · ${pet.manifest.name}`,
								activeNativeImageIds,
								renderOptions(),
							),
						{ placement: "belowEditor" },
					);
				} else if (frame.native && supportsNativeSpriteImages()) {
					const frameImageId = activeNativeImageIds[frameIndex % activeNativeImageIds.length]!;
					const previousImageId = previousNativeFrameImageId;
					previousNativeFrameImageId = frameImageId;
					currentCtx.ui.setWidget(
						"pi-sprite",
						() =>
							buildNativeSpriteWidget(
								frame.native!,
								`pi-sprite · ${state} · ${pet.manifest.name}`,
								frameImageId,
								renderOptions(),
								previousImageId,
							),
						{ placement: "belowEditor" },
					);
				} else {
					currentCtx.ui.setWidget("pi-sprite", formatTextSpriteLines(frame.lines, renderOptions()), {
						placement: "belowEditor",
					});
				}
			};
			applyFrame();
			if (animation.frames.length > 1) {
				animationTimer = setInterval(() => {
					if (!visible || ctx !== currentCtx) return stopAnimation();
					frameIndex++;
					applyFrame();
				}, 400);
			}
		});
	}

	function persist(): void {
		saveSaved({
			selectedPetId,
			visible,
			size,
			label,
			align,
			turnStatusEnabled,
			turnStatusConfigured,
			liveStatusEnabled,
			liveStatusConfigured,
		});
	}

	function activatePet(id: string): void {
		if (!loadPet(id)) throw new Error(`Unknown pet ${id}. Try /pet list.`);
		selectedPetId = id;
		visible = true;
		persist();
		lastSignature = "";
		render();
	}

	async function importPetUrl(urlText: string) {
		const bytes = await downloadToBuffer(urlText);
		const tmp = join(spriteHome(), `import-${Date.now()}.zip`);
		mkdirSync(spriteHome(), { recursive: true });
		writeFileSync(tmp, bytes);
		try {
			return importPetZip(tmp);
		} finally {
			rmSync(tmp, { force: true });
		}
	}

	return {
		async start(nextCtx: ExtensionContext) {
			if (ctx && ctx !== nextCtx) {
				if (resetTimer) clearTimeout(resetTimer);
				resetTimer = undefined;
				stopAnimation();
				if (ctx.hasUI) {
					ctx.ui.setStatus("pi-sprite", undefined);
					clearNativeWidget(ctx, { requireCurrentContext: false, trackTimer: false });
				}
				lastSignature = "";
			}
			ctx = nextCtx;
			clearedStaleNativeImages = false;
			const saved = loadSaved();
			selectedPetId = saved.selectedPetId ?? selectedPetId;
			visible = saved.visible ?? true;
			size = saved.size ?? size;
			label = saved.label ?? label;
			align = saved.align ?? align;
			turnStatusConfigured = saved.turnStatusConfigured ?? false;
			turnStatusEnabled = turnStatusConfigured
				? (saved.turnStatusEnabled ?? DEFAULT_TURN_STATUS_ENABLED)
				: DEFAULT_TURN_STATUS_ENABLED;
			liveStatusConfigured = saved.liveStatusConfigured ?? false;
			liveStatusEnabled = liveStatusConfigured
				? (saved.liveStatusEnabled ?? DEFAULT_LIVE_STATUS_ENABLED)
				: DEFAULT_LIVE_STATUS_ENABLED;
			state = "idle";
			render();
		},
		setState(next: SpriteState, options: { resetMs?: number } = {}) {
			if (resetTimer) clearTimeout(resetTimer);
			if (next !== state) frameIndex = 0;
			state = next;
			render();
			if (options.resetMs) resetTimer = setTimeout(() => this.setState("idle"), options.resetMs);
		},
		setBtwStatus(status: ActivityStatus, count = activity.btwCount) {
			activity = { ...activity, btwStatus: status, btwCount: count };
			updateFooter();
		},
		setRecapStatus(status: ActivityStatus) {
			activity = { ...activity, recapStatus: status };
			updateFooter();
		},
		isTurnStatusEnabled() {
			return turnStatusEnabled;
		},
		isLiveStatusEnabled() {
			return liveStatusEnabled;
		},
		clearTurnStatus() {
			turnStatus = undefined;
			updateFooter();
		},
		setTurnStatusPending() {
			if (!turnStatusEnabled) return;
			turnStatus = "pending";
			updateFooter();
		},
		setTurnStatus(status: TurnStatus | undefined) {
			if (!turnStatusEnabled) return;
			liveStatusGeneration++;
			liveStatus = undefined;
			turnStatus = status;
			updateFooter();
		},
		clearLiveStatus() {
			liveStatusGeneration++;
			liveStatus = undefined;
			updateFooter();
		},
		setLiveStatusPending() {
			if (!liveStatusEnabled) return undefined;
			liveStatusGeneration++;
			liveStatus = "pending";
			updateFooter();
			return liveStatusGeneration;
		},
		setLiveStatus(status: LiveTurnStatus | undefined, generation = liveStatusGeneration) {
			if (!liveStatusEnabled || generation !== liveStatusGeneration) return;
			liveStatus = status;
			updateFooter();
		},
		getBubblePlacement() {
			return bubblePlacement();
		},
		getSpriteName() {
			return selectedName();
		},
		getSpritePersonality() {
			return selectedPersonality();
		},
		shutdown() {
			if (resetTimer) clearTimeout(resetTimer);
			if (clearWidgetTimer) clearTimeout(clearWidgetTimer);
			resetTimer = undefined;
			clearWidgetTimer = undefined;
			stopAnimation();
			if (ctx?.hasUI) {
				ctx.ui.setStatus("pi-sprite", undefined);
				clearNativeWidget(ctx, { removeAfter: false });
			}
			persist();
		},
		setCommandContext(nextCtx: ExtensionContext) {
			ctx = nextCtx;
		},
		statusText() {
			return `pi-sprite: ${visible ? "shown" : "hidden"}; pet=${selectedName()}; state=${state}; size=${size}; label=${label ? "on" : "off"}; align=${align}; turn-status=${turnStatusEnabled ? "on" : "off"}; live-status=${liveStatusEnabled ? "on" : "off"}${turnStatus && turnStatus !== "pending" ? `; ${formatTurnStatusFooter(turnStatus)}` : ""}${liveStatus && liveStatus !== "pending" ? `; ${formatLiveStatusFooter(liveStatus)}` : ""}`;
		},
		selectPet(id: string) {
			activatePet(id);
		},
		importPetUrl,
		show() {
			visible = true;
			persist();
			lastSignature = "";
			render();
		},
		hide() {
			visible = false;
			persist();
			render();
		},
		setSize(nextSize: SpriteSize) {
			size = nextSize;
			persist();
			lastSignature = "";
			render();
		},
		setLabel(nextLabel: boolean) {
			label = nextLabel;
			persist();
			lastSignature = "";
			render();
		},
		setAlign(nextAlign: SpriteAlign) {
			align = nextAlign;
			persist();
			lastSignature = "";
			render();
		},
		setTurnStatusEnabled(enabled: boolean) {
			turnStatusConfigured = true;
			turnStatusEnabled = enabled;
			if (!turnStatusEnabled) turnStatus = undefined;
			persist();
			updateFooter();
		},
		setLiveStatusEnabled(enabled: boolean) {
			liveStatusConfigured = true;
			liveStatusEnabled = enabled;
			liveStatusGeneration++;
			if (!liveStatusEnabled) liveStatus = undefined;
			persist();
			updateFooter();
		},
		clearNative(commandCtx: ExtensionContext) {
			stopAnimation();
			renderGeneration++;
			const clearLines = [...clearTrackedNativeSpriteImages(), ...clearAllNativeSpriteImages()];
			if (clearLines.length) commandCtx.ui.setWidget("pi-sprite", clearLines, { placement: "belowEditor" });
			lastSignature = "";
		},
		registerCommands(pi: ExtensionAPI) {
			registerSpriteCommands(pi, this as SpriteCommandRuntime);
		},
	};
}
