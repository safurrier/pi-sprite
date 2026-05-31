/**
 * Converts Petdex sprite sheets into terminal pixel frames.
 *
 * The renderer uses ANSI truecolor half-blocks: the top source pixel becomes
 * the foreground colour of "▀", and the bottom source pixel becomes the
 * background colour. Transparent pixels are left as spaces.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import type { Intent } from "./content.ts";
import type { Mood } from "./mons.ts";
import type { PetdexPet } from "./petdex.ts";

export type PetdexState =
	| "idle"
	| "runRight"
	| "runLeft"
	| "wave"
	| "jump"
	| "failed"
	| "waiting"
	| "running"
	| "review";
export type RenderSize = "small" | "large";

export interface RenderedPet {
	slug: string;
	displayName: string;
	size: RenderSize;
	maxColumns: number;
	maxRows: number;
	frames: Record<PetdexState, string[][]>;
}

export const PETDEX_STATES: PetdexState[] = [
	"idle",
	"runRight",
	"runLeft",
	"wave",
	"jump",
	"failed",
	"waiting",
	"running",
	"review",
];
export const PETDEX_FRAME_COUNTS: Record<PetdexState, number> = {
	idle: 6,
	runRight: 8,
	runLeft: 8,
	wave: 4,
	jump: 5,
	failed: 8,
	waiting: 6,
	running: 6,
	review: 6,
};
export const PETDEX_ATLAS_ROWS = 9;
export const PETDEX_ATLAS_COLS = 8;
const CACHE_VERSION = 7;
const CACHE_DIR = join(homedir(), ".pi", "agent", "pokepet-cache", "petdex");
const RESET = "\x1b[0m";
const ESC = String.fromCharCode(27);
const ALPHA_THRESHOLD = 16;

export function selectPetdexState(mood: Mood, intent?: Intent): PetdexState {
	if (mood === "working" && intent === "review") return "review";
	switch (mood) {
		case "idle":
		case "sleep":
			return "idle";
		case "talking":
			return "wave";
		case "thinking":
			return "review";
		case "working":
			return "running";
		case "happy":
		case "hatch":
			return "jump";
		case "panic":
			return "failed";
		case "guard":
			return "waiting";
	}
}

export function getRenderedPetFrame(rendered: RenderedPet, mood: Mood, idx: number, intent?: Intent): string[] {
	const state = selectPetdexState(mood, intent);
	const frames = rendered.frames[state] ?? rendered.frames.idle;
	return frames[idx % frames.length] ?? frames[0] ?? [];
}

function fg(r: number, g: number, b: number): string {
	return `\x1b[38;2;${r};${g};${b}m`;
}

function bg(r: number, g: number, b: number): string {
	return `\x1b[48;2;${r};${g};${b}m`;
}

function pixel(data: Buffer, width: number, x: number, y: number): { r: number; g: number; b: number; a: number } {
	const i = (y * width + x) * 4;
	return {
		r: data[i] ?? 0,
		g: data[i + 1] ?? 0,
		b: data[i + 2] ?? 0,
		a: data[i + 3] ?? 0,
	};
}

export function renderRgbaToAnsiLines(data: Buffer, width: number, height: number): string[] {
	const lines: string[] = [];
	const evenHeight = height % 2 === 0 ? height : height - 1;

	for (let y = 0; y < evenHeight; y += 2) {
		let line = "";
		for (let x = 0; x < width; x++) {
			const top = pixel(data, width, x, y);
			const bottom = pixel(data, width, x, y + 1);
			const topOn = top.a >= ALPHA_THRESHOLD;
			const bottomOn = bottom.a >= ALPHA_THRESHOLD;

			if (topOn && bottomOn) {
				line += `${fg(top.r, top.g, top.b)}${bg(bottom.r, bottom.g, bottom.b)}▀`;
			} else if (topOn) {
				line += `${fg(top.r, top.g, top.b)}▀`;
			} else if (bottomOn) {
				line += `${fg(bottom.r, bottom.g, bottom.b)}▄`;
			} else {
				line += " ";
			}
		}
		lines.push(`${line}${RESET}`);
	}

	return trimTransparentMargins(lines);
}

function trimTransparentMargins(lines: string[]): string[] {
	const ansiPattern = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
	const trailingResetPattern = new RegExp(`\\s+${ESC}\\[0m$`);
	const useful = lines.map((line) => line.replace(ansiPattern, ""));
	const first = useful.findIndex((line) => line.trim().length > 0);
	const last = useful.findLastIndex((line) => line.trim().length > 0);
	if (first === -1 || last === -1) return [];
	return lines.slice(first, last + 1).map((line) => line.replace(trailingResetPattern, RESET));
}

export function stripAnsi(text: string): string {
	const ansiPattern = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
	return text.replace(ansiPattern, "");
}

export function visibleWidth(text: string): number {
	return stripAnsi(text).length;
}

function targetWidth(size: RenderSize, maxColumns: number): number {
	const desired = size === "large" ? 40 : 26;
	return Math.max(12, Math.min(desired, maxColumns));
}

function maxRowsForSize(size: RenderSize): number {
	return size === "large" ? 7 : 5;
}

function targetDimensions(
	size: RenderSize,
	maxColumns: number,
	frameWidth: number,
	frameHeight: number,
	maxRows: number,
): { width: number; height: number } {
	const maxWidth = targetWidth(size, maxColumns);
	const maxHeight = Math.max(2, maxRows * 2);
	const scale = Math.min(maxWidth / frameWidth, maxHeight / frameHeight);
	const horizontalBoost = size === "large" ? 1.45 : 1.35;
	const width = Math.max(8, Math.min(maxWidth, Math.round(frameWidth * scale * horizontalBoost)));
	const rawHeight = Math.max(2, Math.min(maxHeight, Math.round(frameHeight * scale)));
	const height = rawHeight % 2 === 0 ? rawHeight : rawHeight - 1;
	return { width, height };
}

function hashFor(buffer: Buffer, size: RenderSize, maxColumns: number, maxRows: number): string {
	return createHash("sha256")
		.update(String(CACHE_VERSION))
		.update(size)
		.update(String(maxColumns))
		.update(String(maxRows))
		.update(buffer)
		.digest("hex")
		.slice(0, 20);
}

function cachePath(slug: string, hash: string): string {
	return join(CACHE_DIR, slug, `${hash}.json`);
}

export interface PixelBounds {
	left: number;
	top: number;
	width: number;
	height: number;
}

export function visiblePixelBounds(data: Buffer, width: number, height: number, padding = 0): PixelBounds {
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const a = data[(y * width + x) * 4 + 3] ?? 0;
			if (a < ALPHA_THRESHOLD) continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	}

	if (maxX === -1 || maxY === -1) return { left: 0, top: 0, width, height };

	const left = Math.max(0, minX - padding);
	const top = Math.max(0, minY - padding);
	const right = Math.min(width - 1, maxX + padding);
	const bottom = Math.min(height - 1, maxY + padding);

	return {
		left,
		top,
		width: right - left + 1,
		height: bottom - top + 1,
	};
}

function readCachedPet(path: string): RenderedPet | undefined {
	try {
		if (!existsSync(path)) return undefined;
		return JSON.parse(readFileSync(path, "utf8")) as RenderedPet;
	} catch {
		return undefined;
	}
}

function writeCachedPet(path: string, rendered: RenderedPet): void {
	try {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, JSON.stringify(rendered));
	} catch {
		/* cache is best-effort */
	}
}

export async function renderPetdexPet(pet: PetdexPet, size: RenderSize): Promise<RenderedPet> {
	return renderPetdexPetForColumns(pet, size, 72, maxRowsForSize(size));
}

export async function renderPetdexPetForColumns(
	pet: PetdexPet,
	size: RenderSize,
	maxColumns: number,
	maxRows = maxRowsForSize(size),
): Promise<RenderedPet> {
	const safeMaxColumns = Math.max(12, Math.floor(maxColumns));
	const safeMaxRows = Math.max(4, Math.floor(maxRows));
	const buffer = readFileSync(pet.spritesheetPath);
	const hash = hashFor(buffer, size, safeMaxColumns, safeMaxRows);
	const path = cachePath(pet.slug, hash);
	const cached = readCachedPet(path);
	if (cached) return cached;

	const metadata = await sharp(buffer).metadata();
	if (!metadata.width || !metadata.height) throw new Error("spritesheet dimensions could not be read");
	if (metadata.width % PETDEX_ATLAS_COLS !== 0 || metadata.height % PETDEX_ATLAS_ROWS !== 0) {
		throw new Error(`spritesheet must be an ${PETDEX_ATLAS_COLS}x${PETDEX_ATLAS_ROWS} atlas`);
	}

	const frameWidth = metadata.width / PETDEX_ATLAS_COLS;
	const frameHeight = metadata.height / PETDEX_ATLAS_ROWS;
	const frames = {} as Record<PetdexState, string[][]>;

	for (let row = 0; row < PETDEX_STATES.length; row++) {
		const state = PETDEX_STATES[row]!;
		frames[state] = [];
		for (let col = 0; col < PETDEX_FRAME_COUNTS[state]; col++) {
			const frame = { left: col * frameWidth, top: row * frameHeight, width: frameWidth, height: frameHeight };
			const frameRaw = await sharp(buffer).extract(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
			const padding = Math.max(2, Math.round(Math.min(frameWidth, frameHeight) * 0.04));
			const bounds = visiblePixelBounds(frameRaw.data, frameRaw.info.width, frameRaw.info.height, padding);
			const target = targetDimensions(size, safeMaxColumns, bounds.width, bounds.height, safeMaxRows);
			const raw = await sharp(buffer)
				.extract({
					left: frame.left + bounds.left,
					top: frame.top + bounds.top,
					width: bounds.width,
					height: bounds.height,
				})
				.resize({
					width: target.width,
					height: target.height,
					fit: "contain",
					kernel: sharp.kernel.nearest,
					background: { r: 0, g: 0, b: 0, alpha: 0 },
				})
				.ensureAlpha()
				.raw()
				.toBuffer({ resolveWithObject: true });
			frames[state].push(renderRgbaToAnsiLines(raw.data, raw.info.width, raw.info.height));
		}
	}

	const rendered: RenderedPet = {
		slug: pet.slug,
		displayName: pet.metadata.displayName,
		size,
		maxColumns: safeMaxColumns,
		maxRows: safeMaxRows,
		frames,
	};
	writeCachedPet(path, rendered);
	return rendered;
}
