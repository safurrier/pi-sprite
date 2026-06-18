import { statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type { InstalledPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";

const RESET = "\u001b[0m";
const MAX_COLUMNS = 24;
const MAX_TEXT_ROWS = 8;

export interface RenderedSprite {
	lines: string[];
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

async function imageForState(pet: InstalledPet, state: SpriteState): Promise<sharp.Sharp> {
	const relative = sourcePath(pet, state);
	if (!relative) throw new Error("missing sprite path");
	const file = join(pet.dir, relative);
	const image = sharp(file, { animated: false, limitInputPixels: 32 * 1024 * 1024 }).rotate();
	const metadata = await image.metadata();
	const frameWidth = pet.manifest.frame?.width;
	const frameHeight = pet.manifest.frame?.height;
	if (
		frameWidth &&
		frameHeight &&
		metadata.width &&
		metadata.height &&
		metadata.width >= frameWidth &&
		metadata.height >= frameHeight
	) {
		return image.extract({ left: 0, top: 0, width: frameWidth, height: frameHeight });
	}
	return image;
}

export async function renderSpriteFrame(pet: InstalledPet, state: SpriteState): Promise<RenderedSprite> {
	const relative = sourcePath(pet, state) ?? "";
	const file = relative ? join(pet.dir, relative) : "";
	try {
		const mtime = statSync(file).mtimeMs;
		const image = await imageForState(pet, state);
		const { data, info } = await image
			.resize({ width: MAX_COLUMNS, height: MAX_TEXT_ROWS * 2, fit: "inside", withoutEnlargement: true })
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });
		const art = pixelsToHalfBlocks(data, info.width, info.height);
		if (!art.length) throw new Error("empty sprite frame");
		return {
			lines: [...art, `pi-sprite · ${state} · ${pet.manifest.name}`],
			signature: `${pet.id}:${state}:${relative}:${mtime}:${info.width}x${info.height}`,
		};
	} catch {
		return {
			lines: [`  ◕‿◕  ${pet.manifest.name}`, `pi-sprite · ${state}${relative ? ` · ${relative}` : ""}`],
			signature: `${pet.id}:${state}:${relative}:fallback`,
		};
	}
}
