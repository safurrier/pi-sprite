import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import { join } from "node:path";
import {
	type Component,
	deleteAllKittyImages,
	deleteKittyImage,
	encodeKitty,
	getCapabilities,
	getCellDimensions,
	Image,
	visibleWidth,
} from "@earendil-works/pi-tui";
import sharp from "sharp";
import type { InstalledPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";

const RESET = "\u001b[0m";
const SIZE_PRESETS = {
	tiny: { columns: 12, rows: 3 },
	small: { columns: 16, rows: 4 },
	medium: { columns: 20, rows: 6 },
	large: { columns: 24, rows: 8 },
} as const;

export type SpriteSize = keyof typeof SIZE_PRESETS;
export type SpriteAlign = "left" | "right";

export interface SpriteRenderOptions {
	size?: SpriteSize;
	label?: boolean;
	align?: SpriteAlign;
}

function preset(options: SpriteRenderOptions = {}): { columns: number; rows: number } {
	return SIZE_PRESETS[options.size ?? "small"];
}
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
const TUI_IMAGE_CLEANUP_GUARD_SEQUENCE = "\u001b_Ga=d,d=I,i=0,q=2\u001b\\";

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

const MAX_RENDER_CACHE_ENTRIES = 48;
const renderCache = new Map<string, RenderedSpriteAnimation>();

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
	options: SpriteRenderOptions = {},
): Promise<RenderedSpriteFrame> {
	const size = preset(options);
	const extracted = sharp(file, { animated: false, limitInputPixels: 32 * 1024 * 1024 })
		.rotate()
		.extract({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
	const png = await extracted.png().toBuffer();
	const { data, info } = await sharp(png)
		.resize({
			width: size.columns,
			height: size.rows * 2,
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
		lines: options.label ? [...art, label] : art,
		signature: frameHash([
			...signatureParts,
			rect.name,
			`${info.width}x${info.height}`,
			options.label ? "label" : "no-label",
		]),
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

function terminalSupportsKittyControl(): boolean {
	return getCapabilities().images === "kitty" || outerTerminalSupportsKittyImages();
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

function nativeImageCellSize(
	frame: NativeSpriteFrame,
	maxWidth: number,
	maxRows: number,
): { columns: number; rows: number } {
	const cell = getCellDimensions();
	const widthScale = (maxWidth * cell.widthPx) / Math.max(1, frame.width);
	const heightScale = (maxRows * cell.heightPx) / Math.max(1, frame.height);
	const scale = Math.min(widthScale, heightScale);
	const columns = Math.ceil((frame.width * scale) / cell.widthPx);
	const rows = Math.ceil((frame.height * scale) / cell.heightPx);
	return { columns: Math.max(1, Math.min(maxWidth, columns)), rows: Math.max(1, Math.min(maxRows, rows)) };
}

function alignLine(line: string, width: number, align: SpriteAlign): string {
	if (align !== "right") return line;
	return `${" ".repeat(Math.max(0, width - visibleWidth(line) - 1))}${line}`;
}

export function clearNativeSpriteImage(imageId: number): string[] {
	if (!terminalSupportsKittyControl()) return [];
	const sequence = deleteKittyImage(imageId);
	return [isTmux() ? wrapTmuxPassthrough(sequence) : sequence];
}

export function clearNativeSpriteImages(imageIds: number[]): string[] {
	return imageIds.flatMap((imageId) => clearNativeSpriteImage(imageId));
}

export function clearAllNativeSpriteImages(): string[] {
	if (!terminalSupportsKittyControl()) return [];
	const sequence = deleteAllKittyImages();
	return [isTmux() ? wrapTmuxPassthrough(sequence) : sequence];
}

class KittySpriteImage implements Component {
	constructor(
		private readonly frame: NativeSpriteFrame,
		private readonly imageId: number,
		private readonly wrapForTmux: boolean,
		private readonly options: SpriteRenderOptions,
		private readonly previousImageId?: number,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const configured = preset(this.options);
		const maxWidth = Math.max(1, Math.min(width - 2, configured.columns));
		const size = nativeImageCellSize(this.frame, maxWidth, configured.rows);
		const drawSequence = encodeKitty(this.frame.base64, {
			columns: size.columns,
			rows: size.rows,
			imageId: this.imageId,
			moveCursor: false,
		});
		const deletePreviousSequence =
			this.previousImageId && this.previousImageId !== this.imageId ? deleteKittyImage(this.previousImageId) : "";
		const sequence = `${TUI_IMAGE_CLEANUP_GUARD_SEQUENCE}${drawSequence}${deletePreviousSequence}`;
		const lines = [this.wrapForTmux ? wrapTmuxPassthrough(sequence) : sequence];
		for (let i = 0; i < size.rows - 1; i++) lines.push("");
		return lines;
	}
}

class TextSpriteWidget implements Component {
	constructor(
		private readonly lines: string[],
		private readonly options: SpriteRenderOptions,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		return this.lines.map((line) => alignLine(line, width, this.options.align ?? "left"));
	}
}

class NativeSpriteWidget implements Component {
	constructor(
		private readonly image: Component,
		private readonly statusLine: string,
		private readonly reservedColumns: number,
		private readonly options: SpriteRenderOptions,
	) {}

	invalidate(): void {
		this.image.invalidate();
	}

	render(width: number): string[] {
		const align = this.options.align ?? "left";
		const pad = align === "right" ? " ".repeat(Math.max(0, width - this.reservedColumns - 1)) : "";
		const imageLines = this.image.render(width).map((line, index) => (index === 0 ? `${pad}${line}` : line));
		if (!this.options.label) return imageLines;
		return [...imageLines, alignLine(this.statusLine, width, align)];
	}
}

export function formatTextSpriteLines(
	lines: string[],
	options: SpriteRenderOptions = {},
	width = process.stdout.columns || 80,
): string[] {
	return lines.map((line) => alignLine(line, width, options.align ?? "left"));
}

export function formatNativeSpritePlaceholderLines(
	prefixLines: string[] = [],
	options: SpriteRenderOptions = {},
	width = process.stdout.columns || 80,
): string[] {
	const rows = preset(options).rows + (options.label ? 1 : 0);
	const blank = " ".repeat(Math.max(1, width - 1));
	return [...prefixLines, ...Array.from({ length: rows }, () => blank)];
}

export function buildTextSpriteWidget(lines: string[], options: SpriteRenderOptions = {}): Component {
	return new TextSpriteWidget(lines, options);
}

export function supportsNativeSpriteImages(): boolean {
	return spriteImageProtocol() !== null;
}

export function buildNativeSpriteWidget(
	frame: NativeSpriteFrame,
	statusLine: string,
	imageId: number,
	options: SpriteRenderOptions = {},
	previousImageId?: number,
): Component {
	const protocol = spriteImageProtocol();
	const size = preset(options);
	const image =
		protocol === "kitty"
			? new KittySpriteImage(frame, imageId, isTmux(), options, previousImageId)
			: new Image(
					frame.base64,
					"image/png",
					{ fallbackColor: (text) => text },
					{ maxWidthCells: size.columns, maxHeightCells: size.rows, filename: frame.filename, imageId },
					{ widthPx: frame.width, heightPx: frame.height },
				);
	return new NativeSpriteWidget(image, statusLine, size.columns, options);
}

export async function renderSpriteAnimation(
	pet: InstalledPet,
	state: SpriteState,
	options: SpriteRenderOptions = {},
): Promise<RenderedSpriteAnimation> {
	const relative = sourcePath(pet, state) ?? "";
	const file = relative ? join(pet.dir, relative) : "";
	try {
		const mtime = statSync(file).mtimeMs;
		const cacheKey = [
			pet.id,
			pet.manifest.name,
			pet.dir,
			state,
			relative,
			String(mtime),
			JSON.stringify(pet.manifest.frame ?? {}),
			options.size ?? "small",
			options.label ? "label" : "no-label",
			options.align ?? "left",
		].join("\0");
		const cached = renderCache.get(cacheKey);
		if (cached) return cached;
		const image = sharp(file, { animated: false, limitInputPixels: 32 * 1024 * 1024 }).rotate();
		const metadata = await image.metadata();
		const rects = frameRects(state, metadata, pet.manifest.frame, /spritesheet/i.test(relative)).filter(
			(rect) => rect.width > 0 && rect.height > 0,
		);
		const label = `pi-sprite · ${state} · ${pet.manifest.name}`;
		const signatureParts = [pet.id, state, relative, String(mtime)];
		const frames = await Promise.all(rects.map((rect) => renderRect(file, rect, label, signatureParts, options)));
		if (!frames.length) throw new Error("empty sprite animation");
		const animation = { frames, signature: frameHash(signatureParts) };
		renderCache.set(cacheKey, animation);
		if (renderCache.size > MAX_RENDER_CACHE_ENTRIES) renderCache.delete(renderCache.keys().next().value!);
		return animation;
	} catch {
		const fallbackLines = [`  ◕‿◕  ${pet.manifest.name}`];
		if (options.label) fallbackLines.push(`pi-sprite · ${state}${relative ? ` · ${relative}` : ""}`);
		const fallback = {
			lines: fallbackLines,
			signature: `${pet.id}:${state}:${relative}:fallback:${options.label ? "label" : "no-label"}`,
		};
		return { frames: [fallback], signature: fallback.signature };
	}
}

export async function renderSpriteFrame(
	pet: InstalledPet,
	state: SpriteState,
	options: SpriteRenderOptions = {},
): Promise<RenderedSpriteFrame> {
	return (await renderSpriteAnimation(pet, state, options)).frames[0]!;
}
