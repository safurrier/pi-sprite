import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import {
	type Component,
	Container,
	encodeKitty,
	getCapabilities,
	getCellDimensions,
	Image,
	Text,
} from "@earendil-works/pi-tui";
import sharp from "sharp";
import type { InstalledPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";

const RESET = "\u001b[0m";
const MAX_COLUMNS = 24;
const MAX_TEXT_ROWS = 8;
const PETDEX_ATLAS_ROWS = 9;
const PETDEX_ATLAS_COLS = 8;
const PETDEX_FRAME_COUNTS = {
	idle: 6,
	runRight: 8,
	runLeft: 8,
	wave: 4,
	jump: 5,
	failed: 8,
	waiting: 6,
	running: 6,
	review: 6,
} as const;
const STATE_TO_ATLAS_ROW: Record<SpriteState, { row: number; frames: number }> = {
	idle: { row: 0, frames: PETDEX_FRAME_COUNTS.idle },
	thinking: { row: 8, frames: PETDEX_FRAME_COUNTS.review },
	working: { row: 7, frames: PETDEX_FRAME_COUNTS.running },
	success: { row: 4, frames: PETDEX_FRAME_COUNTS.jump },
	error: { row: 5, frames: PETDEX_FRAME_COUNTS.failed },
};
const DISABLE_NATIVE_IMAGE_VALUES = new Set(["0", "false", "off", "none", "ansi"]);
const KITTY_NATIVE_IMAGE_VALUES = new Set(["1", "true", "on", "kitty"]);
const TMUX_PASSTHROUGH_PREFIX = "\u001bPtmux;";
const TMUX_PASSTHROUGH_SUFFIX = "\u001b\\";

export interface NativeSpriteFrame {
	base64: string;
	filename: string;
	width: number;
	height: number;
}

export interface RenderedSpriteFrame {
	lines: string[];
	signature: string;
	native?: NativeSpriteFrame;
}

export interface RenderedSpriteAnimation {
	frames: RenderedSpriteFrame[];
	signature: string;
}

function color(r: number, g: number, b: number, target: "fg" | "bg"): string {
	return `\u001b[${target === "fg" ? 38 : 48};2;${r};${g};${b}m`;
}

function visiblePixel(data: Buffer, offset: number): [number, number, number] | undefined {
	const alpha = data[offset + 3] ?? 255;
	if (alpha < 32) return undefined;
	return [data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0];
}

function pixelsToHalfBlocks(data: Buffer, width: number, height: number): string[] {
	const lines: string[] = [];
	for (let y = 0; y < height; y += 2) {
		let line = "";
		for (let x = 0; x < width; x++) {
			const top = visiblePixel(data, (y * width + x) * 4);
			const bottom = y + 1 < height ? visiblePixel(data, ((y + 1) * width + x) * 4) : undefined;
			if (top && bottom) line += `${color(...top, "fg")}${color(...bottom, "bg")}▀${RESET}`;
			else if (top) line += `${color(...top, "fg")}▀${RESET}`;
			else if (bottom) line += `${color(...bottom, "fg")}▄${RESET}`;
			else line += " ";
		}
		lines.push(line.replace(/\s+$/u, ""));
	}
	return lines.filter((line) => line.trim().length > 0);
}

function sourcePath(pet: InstalledPet, state: SpriteState): string | undefined {
	return pet.manifest.sprites[state] ?? pet.manifest.sprites.idle;
}

function frameHash(parts: string[]): string {
	return createHash("sha1").update(parts.join("\0")).digest("hex").slice(0, 12);
}

function frameRects(
	state: SpriteState,
	metadata: sharp.Metadata,
	configuredFrame: { width?: number; height?: number } = {},
	looksLikeSpritesheet = false,
): Array<{ left: number; top: number; width: number; height: number; name: string }> {
	const imageWidth = metadata.width ?? 0;
	const imageHeight = metadata.height ?? 0;
	const inferredAtlas =
		looksLikeSpritesheet &&
		imageWidth >= PETDEX_ATLAS_COLS &&
		imageHeight >= PETDEX_ATLAS_ROWS &&
		imageWidth % PETDEX_ATLAS_COLS === 0 &&
		imageHeight % PETDEX_ATLAS_ROWS === 0;
	const frameWidth = Math.floor(configuredFrame.width ?? (inferredAtlas ? imageWidth / PETDEX_ATLAS_COLS : imageWidth));
	const frameHeight = Math.floor(
		configuredFrame.height ?? (inferredAtlas ? imageHeight / PETDEX_ATLAS_ROWS : imageHeight),
	);
	if (frameWidth > 0 && frameHeight > 0 && imageWidth >= frameWidth && imageHeight >= frameHeight) {
		const cols = Math.floor(imageWidth / frameWidth);
		const rows = Math.floor(imageHeight / frameHeight);
		if (cols >= PETDEX_ATLAS_COLS && rows >= PETDEX_ATLAS_ROWS) {
			const mapping = STATE_TO_ATLAS_ROW[state];
			return Array.from({ length: Math.min(mapping.frames, cols) }, (_, col) => ({
				left: col * frameWidth,
				top: mapping.row * frameHeight,
				width: frameWidth,
				height: frameHeight,
				name: `${state}-${col}`,
			}));
		}
		return Array.from({ length: Math.max(1, cols) }, (_, col) => ({
			left: col * frameWidth,
			top: 0,
			width: frameWidth,
			height: frameHeight,
			name: `${state}-${col}`,
		}));
	}
	return [{ left: 0, top: 0, width: imageWidth, height: imageHeight, name: state }];
}

async function renderRect(
	file: string,
	rect: { left: number; top: number; width: number; height: number; name: string },
	label: string,
	signatureParts: string[],
): Promise<RenderedSpriteFrame> {
	const extracted = sharp(file, { animated: false, limitInputPixels: 32 * 1024 * 1024 })
		.rotate()
		.extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
	const png = await extracted.png().toBuffer();
	const { data, info } = await sharp(png)
		.resize({
			width: MAX_COLUMNS,
			height: MAX_TEXT_ROWS * 2,
			fit: "inside",
			withoutEnlargement: true,
			kernel: sharp.kernel.nearest,
		})
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	const art = pixelsToHalfBlocks(data, info.width, info.height);
	if (!art.length) throw new Error("empty sprite frame");
	return {
		lines: [...art, label],
		signature: frameHash([...signatureParts, rect.name, `${info.width}x${info.height}`]),
		native: {
			base64: png.toString("base64"),
			filename: `${frameHash([...signatureParts, rect.name])}.png`,
			width: rect.width,
			height: rect.height,
		},
	};
}

function explicitNativeImageSetting(): string {
	return process.env.PI_SPRITE_NATIVE_IMAGES?.trim().toLowerCase() ?? "";
}

function isTmux(): boolean {
	const term = process.env.TERM?.toLowerCase() ?? "";
	return Boolean(process.env.TMUX || term.startsWith("tmux") || term.startsWith("screen"));
}

function outerTerminalSupportsKittyImages(): boolean {
	const termProgram = process.env.TERM_PROGRAM?.toLowerCase() ?? "";
	const terminalEmulator = process.env.TERMINAL_EMULATOR?.toLowerCase() ?? "";
	return Boolean(
		process.env.KITTY_WINDOW_ID ||
			process.env.GHOSTTY_RESOURCES_DIR ||
			process.env.WEZTERM_PANE ||
			termProgram === "kitty" ||
			termProgram === "ghostty" ||
			termProgram === "wezterm" ||
			terminalEmulator === "ghostty" ||
			terminalEmulator === "wezterm",
	);
}

function spriteImageProtocol(): "kitty" | "iterm2" | null {
	const setting = explicitNativeImageSetting();
	if (DISABLE_NATIVE_IMAGE_VALUES.has(setting)) return null;
	if (KITTY_NATIVE_IMAGE_VALUES.has(setting)) return "kitty";
	const protocol = getCapabilities().images;
	if (protocol === "kitty" || protocol === "iterm2") return protocol;
	if (isTmux() && outerTerminalSupportsKittyImages()) return "kitty";
	return null;
}

function wrapTmuxPassthrough(sequence: string): string {
	return `${TMUX_PASSTHROUGH_PREFIX}${sequence.replaceAll("\u001b", "\u001b\u001b")}${TMUX_PASSTHROUGH_SUFFIX}`;
}

function nativeImageCellSize(frame: NativeSpriteFrame, maxWidth: number): { columns: number; rows: number } {
	const cell = getCellDimensions();
	const widthScale = (maxWidth * cell.widthPx) / Math.max(1, frame.width);
	const heightScale = (MAX_TEXT_ROWS * cell.heightPx) / Math.max(1, frame.height);
	const scale = Math.min(widthScale, heightScale);
	const columns = Math.ceil((frame.width * scale) / cell.widthPx);
	const rows = Math.ceil((frame.height * scale) / cell.heightPx);
	return { columns: Math.max(1, Math.min(maxWidth, columns)), rows: Math.max(1, Math.min(MAX_TEXT_ROWS, rows)) };
}

class KittySpriteImage implements Component {
	constructor(
		private readonly frame: NativeSpriteFrame,
		private readonly imageId: number,
		private readonly wrapForTmux: boolean,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const maxWidth = Math.max(1, Math.min(width - 2, MAX_COLUMNS));
		const size = nativeImageCellSize(this.frame, maxWidth);
		const sequence = encodeKitty(this.frame.base64, {
			columns: size.columns,
			rows: size.rows,
			imageId: this.imageId,
			moveCursor: false,
		});
		const lines = [this.wrapForTmux ? wrapTmuxPassthrough(sequence) : sequence];
		for (let i = 0; i < size.rows - 1; i++) lines.push("");
		return lines;
	}
}

export function supportsNativeSpriteImages(): boolean {
	return spriteImageProtocol() !== null;
}

export function buildNativeSpriteWidget(frame: NativeSpriteFrame, statusLine: string, imageId: number): Component {
	const widget = new Container();
	const protocol = spriteImageProtocol();
	if (protocol === "kitty" && getCapabilities().images !== "kitty") {
		widget.addChild(new KittySpriteImage(frame, imageId, isTmux()));
	} else {
		widget.addChild(
			new Image(
				frame.base64,
				"image/png",
				{ fallbackColor: (text) => text },
				{ maxWidthCells: MAX_COLUMNS, maxHeightCells: MAX_TEXT_ROWS, filename: frame.filename, imageId },
				{ widthPx: frame.width, heightPx: frame.height },
			),
		);
	}
	widget.addChild(new Text(statusLine, 1, 0));
	return widget;
}

export async function renderSpriteAnimation(pet: InstalledPet, state: SpriteState): Promise<RenderedSpriteAnimation> {
	const relative = sourcePath(pet, state) ?? "";
	const file = relative ? join(pet.dir, relative) : "";
	try {
		const mtime = statSync(file).mtimeMs;
		const image = sharp(file, { animated: false, limitInputPixels: 32 * 1024 * 1024 }).rotate();
		const metadata = await image.metadata();
		const rects = frameRects(state, metadata, pet.manifest.frame, /spritesheet/i.test(relative)).filter(
			(rect) => rect.width > 0 && rect.height > 0,
		);
		const label = `pi-sprite · ${state} · ${pet.manifest.name}`;
		const signatureParts = [pet.id, state, relative, String(mtime)];
		const frames = await Promise.all(rects.map((rect) => renderRect(file, rect, label, signatureParts)));
		if (!frames.length) throw new Error("empty sprite animation");
		return { frames, signature: frameHash(signatureParts) };
	} catch {
		const fallback = {
			lines: [`  ◕‿◕  ${pet.manifest.name}`, `pi-sprite · ${state}${relative ? ` · ${relative}` : ""}`],
			signature: `${pet.id}:${state}:${relative}:fallback`,
		};
		return { frames: [fallback], signature: fallback.signature };
	}
}

export async function renderSpriteFrame(pet: InstalledPet, state: SpriteState): Promise<RenderedSpriteFrame> {
	return (await renderSpriteAnimation(pet, state)).frames[0]!;
}
