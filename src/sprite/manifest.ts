import { extname, isAbsolute, normalize, sep } from "node:path";

export type SpriteState = "idle" | "thinking" | "working" | "success" | "error";
export const SPRITE_STATES: SpriteState[] = ["idle", "thinking", "working", "success", "error"];

export interface PetManifest {
	id: string;
	name: string;
	version?: string;
	author?: string;
	description?: string;
	sprites: Partial<Record<SpriteState, string>>;
	frame?: { width?: number; height?: number };
}

const VALID_ASSET_EXTENSIONS = new Set([".png", ".webp", ".gif", ".jpg", ".jpeg"]);

export function normalizePetId(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		.slice(0, 80);
}

function asRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("pet.json must be an object");
	return value as Record<string, unknown>;
}

function safeRelativeAsset(path: string): string {
	if (!path.trim()) throw new Error("sprite path cannot be empty");
	if (isAbsolute(path)) throw new Error("sprite paths must be relative");
	const normalized = normalize(path);
	if (normalized === ".." || normalized.startsWith(`..${sep}`) || normalized.includes(`${sep}..${sep}`)) {
		throw new Error("sprite paths must stay inside the pet folder");
	}
	if (!VALID_ASSET_EXTENSIONS.has(extname(normalized).toLowerCase())) {
		throw new Error("sprite files must be png, webp, gif, jpg, or jpeg");
	}
	return normalized;
}

export function parsePetManifest(raw: unknown): PetManifest {
	const data = asRecord(raw);
	const codexId = typeof data.id === "string" ? data.id : "";
	const id = normalizePetId(codexId);
	if (!id) throw new Error("pet.json missing valid id");
	const name =
		(typeof data.name === "string" && data.name.trim()) ||
		(typeof data.displayName === "string" && data.displayName.trim()) ||
		id;
	const sprites: Partial<Record<SpriteState, string>> = {};
	if (data.sprites && typeof data.sprites === "object" && !Array.isArray(data.sprites)) {
		for (const state of SPRITE_STATES) {
			const value = (data.sprites as Record<string, unknown>)[state];
			if (typeof value === "string") sprites[state] = safeRelativeAsset(value);
		}
	}
	if (typeof data.spritesheetPath === "string") {
		sprites.idle = safeRelativeAsset(data.spritesheetPath);
	}
	if (!sprites.idle) throw new Error("pet.json must define sprites.idle or spritesheetPath");
	return {
		id,
		name,
		version: typeof data.version === "string" ? data.version : undefined,
		author: typeof data.author === "string" ? data.author : undefined,
		description: typeof data.description === "string" ? data.description : undefined,
		sprites,
		frame: data.frame && typeof data.frame === "object" ? (data.frame as PetManifest["frame"]) : undefined,
	};
}
