/**
 * Extracts Petdex sprite-sheet frames as original-quality PNG images for Pi's
 * native terminal image renderer.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import sharp from "sharp";
import type { Intent } from "./content.ts";
import type { Mood } from "./mons.ts";
import type { PetdexPet } from "./petdex.ts";
import {
	PETDEX_ATLAS_COLS,
	PETDEX_ATLAS_ROWS,
	PETDEX_FRAME_COUNTS,
	PETDEX_STATES,
	type PetdexState,
	selectPetdexState,
} from "./petdex-renderer.ts";

export interface NativePetdexFrame {
	base64: string;
	filename: string;
	width: number;
	height: number;
}

export interface NativeRenderedPet {
	slug: string;
	displayName: string;
	frameWidth: number;
	frameHeight: number;
	cacheKey: string;
	frames: Record<PetdexState, NativePetdexFrame[]>;
}

interface CachedNativeFrame {
	filename: string;
	width: number;
	height: number;
}

interface CachedNativePet {
	slug: string;
	displayName: string;
	frameWidth: number;
	frameHeight: number;
	cacheKey: string;
	frames: Record<PetdexState, CachedNativeFrame[]>;
}

const CACHE_VERSION = 1;
const CACHE_DIR = join(homedir(), ".pi", "agent", "pokepet-cache", "petdex-native");

function hashFor(buffer: Buffer): string {
	return createHash("sha256").update(String(CACHE_VERSION)).update(buffer).digest("hex").slice(0, 20);
}

function cacheDir(slug: string, hash: string): string {
	return join(CACHE_DIR, slug, hash);
}

function cacheManifestPath(slug: string, hash: string): string {
	return join(cacheDir(slug, hash), "frames.json");
}

function readCachedNativePet(path: string): NativeRenderedPet | undefined {
	try {
		if (!existsSync(path)) return undefined;
		const cached = JSON.parse(readFileSync(path, "utf8")) as CachedNativePet;
		const root = dirname(path);
		const frames = {} as Record<PetdexState, NativePetdexFrame[]>;
		for (const state of PETDEX_STATES) {
			frames[state] = [];
			for (const frame of cached.frames[state] ?? []) {
				const framePath = join(root, frame.filename);
				if (!existsSync(framePath)) return undefined;
				frames[state].push({
					...frame,
					base64: readFileSync(framePath).toString("base64"),
				});
			}
		}
		return { ...cached, frames };
	} catch {
		return undefined;
	}
}

function writeCachedNativePet(path: string, rendered: NativeRenderedPet): void {
	try {
		const root = dirname(path);
		mkdirSync(root, { recursive: true });
		const cachedFrames = {} as Record<PetdexState, CachedNativeFrame[]>;
		for (const state of PETDEX_STATES) {
			cachedFrames[state] = [];
			for (const frame of rendered.frames[state]) {
				writeFileSync(join(root, frame.filename), Buffer.from(frame.base64, "base64"));
				cachedFrames[state].push({
					filename: frame.filename,
					width: frame.width,
					height: frame.height,
				});
			}
		}
		const cached: CachedNativePet = {
			slug: rendered.slug,
			displayName: rendered.displayName,
			frameWidth: rendered.frameWidth,
			frameHeight: rendered.frameHeight,
			cacheKey: rendered.cacheKey,
			frames: cachedFrames,
		};
		writeFileSync(path, JSON.stringify(cached));
	} catch {
		/* cache is best-effort */
	}
}

export async function prepareNativePetdexPet(pet: PetdexPet): Promise<NativeRenderedPet> {
	const buffer = readFileSync(pet.spritesheetPath);
	const hash = hashFor(buffer);
	const path = cacheManifestPath(pet.slug, hash);
	const cached = readCachedNativePet(path);
	if (cached) return cached;

	const metadata = await sharp(buffer).metadata();
	if (!metadata.width || !metadata.height) throw new Error("spritesheet dimensions could not be read");
	if (metadata.width % PETDEX_ATLAS_COLS !== 0 || metadata.height % PETDEX_ATLAS_ROWS !== 0) {
		throw new Error(`spritesheet must be an ${PETDEX_ATLAS_COLS}x${PETDEX_ATLAS_ROWS} atlas`);
	}

	const frameWidth = metadata.width / PETDEX_ATLAS_COLS;
	const frameHeight = metadata.height / PETDEX_ATLAS_ROWS;
	const frames = {} as Record<PetdexState, NativePetdexFrame[]>;

	for (let row = 0; row < PETDEX_STATES.length; row++) {
		const state = PETDEX_STATES[row]!;
		frames[state] = [];
		for (let col = 0; col < PETDEX_FRAME_COUNTS[state]; col++) {
			const png = await sharp(buffer)
				.extract({ left: col * frameWidth, top: row * frameHeight, width: frameWidth, height: frameHeight })
				.png()
				.toBuffer();
			frames[state].push({
				base64: png.toString("base64"),
				filename: `${state}-${col}.png`,
				width: frameWidth,
				height: frameHeight,
			});
		}
	}

	const rendered: NativeRenderedPet = {
		slug: pet.slug,
		displayName: pet.metadata.displayName,
		frameWidth,
		frameHeight,
		cacheKey: hash,
		frames,
	};
	writeCachedNativePet(path, rendered);
	return rendered;
}

export function getNativePetdexFrame(
	rendered: NativeRenderedPet,
	mood: Mood,
	idx: number,
	intent?: Intent,
): NativePetdexFrame | undefined {
	const state = selectPetdexState(mood, intent);
	const frames = rendered.frames[state] ?? rendered.frames.idle;
	return frames[idx % frames.length] ?? frames[0];
}
