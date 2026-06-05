/**
 * Petdex package loading and gallery install helpers.
 *
 * Petdex pets live at ~/.codex/pets/<slug>/ as pet.json plus a spritesheet.
 * The public gallery manifest points at the same files over HTTPS.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, normalize, resolve, sep } from "node:path";

export const PETDEX_MANIFEST_URL = "https://petdex.crafter.run/api/manifest";
export const PETDEX_PETS_DIR = process.env.PI_POKEPET_PETDEX_DIR || join(homedir(), ".codex", "pets");

export interface PetdexMetadata {
	id: string;
	displayName: string;
	description: string;
	spritesheetPath: string;
}

export interface PetdexPet {
	slug: string;
	dir: string;
	metadata: PetdexMetadata;
	spritesheetPath: string;
}

export interface PetdexManifestPet {
	slug: string;
	displayName: string;
	kind?: string;
	submittedBy?: string;
	spritesheetUrl: string;
	petJsonUrl: string;
	zipUrl?: string | null;
}

export interface PetdexManifest {
	generatedAt?: string;
	total?: number;
	pets: PetdexManifestPet[];
}

const VALID_SPRITE_EXT = new Set([".webp", ".png"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

export function validatePetJson(raw: unknown): PetdexMetadata {
	if (!isRecord(raw)) throw new Error("pet.json must be an object");

	const id = cleanString(raw.id);
	const displayName = cleanString(raw.displayName);
	const description = cleanString(raw.description);
	const spritesheetPath = cleanString(raw.spritesheetPath);

	if (!id) throw new Error("pet.json missing id");
	if (!displayName) throw new Error("pet.json missing displayName");
	if (!description) throw new Error("pet.json missing description");
	if (!spritesheetPath) throw new Error("pet.json missing spritesheetPath");
	if (isAbsolute(spritesheetPath)) throw new Error("spritesheetPath must be relative");

	const normalized = normalize(spritesheetPath);
	if (normalized.startsWith("..") || normalized.includes(`..${sep}`)) {
		throw new Error("spritesheetPath must stay inside the pet folder");
	}

	const ext = extname(normalized).toLowerCase();
	if (!VALID_SPRITE_EXT.has(ext)) throw new Error("spritesheetPath must end in .webp or .png");

	return { id, displayName, description, spritesheetPath: normalized };
}

export function loadLocalPetdexPet(slug: string): PetdexPet | undefined {
	const safeSlug = slug.trim();
	if (!safeSlug || safeSlug.includes("/") || safeSlug.includes("\\") || safeSlug.includes("..")) return undefined;

	const dir = join(PETDEX_PETS_DIR, safeSlug);
	const petJsonPath = join(dir, "pet.json");
	if (!existsSync(petJsonPath)) return undefined;

	try {
		const metadata = validatePetJson(JSON.parse(readFileSync(petJsonPath, "utf8")));
		const spritesheetPath = resolve(dir, metadata.spritesheetPath);
		const root = resolve(dir);
		if (spritesheetPath !== root && !spritesheetPath.startsWith(`${root}${sep}`)) return undefined;
		if (!existsSync(spritesheetPath)) return undefined;
		return { slug: safeSlug, dir, metadata, spritesheetPath };
	} catch {
		return undefined;
	}
}

export function listLocalPetdexPets(): PetdexPet[] {
	if (!existsSync(PETDEX_PETS_DIR)) return [];
	return readdirSync(PETDEX_PETS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => loadLocalPetdexPet(entry.name))
		.filter((pet): pet is PetdexPet => Boolean(pet))
		.sort((a, b) => a.metadata.displayName.localeCompare(b.metadata.displayName));
}

const MANIFEST_CACHE_FILE = process.env.PI_POKEPET_PETDEX_DIR
	? join(process.env.PI_POKEPET_PETDEX_DIR, "pokepet-manifest.json")
	: join(homedir(), ".pi", "agent", "pokepet-manifest.json");

export async function fetchPetdexManifest(): Promise<PetdexManifest> {
	let rawData: unknown;
	try {
		const res = await fetch(PETDEX_MANIFEST_URL, { headers: { accept: "application/json" } });
		if (!res.ok) throw new Error(`manifest fetch failed (${res.status})`);
		rawData = (await res.json()) as unknown;

		try {
			mkdirSync(dirname(MANIFEST_CACHE_FILE), { recursive: true });
			writeFileSync(MANIFEST_CACHE_FILE, JSON.stringify(rawData, null, 2));
		} catch {
			// ignore cache write errors
		}
	} catch (err) {
		if (existsSync(MANIFEST_CACHE_FILE)) {
			try {
				rawData = JSON.parse(readFileSync(MANIFEST_CACHE_FILE, "utf8"));
			} catch {
				throw err;
			}
		} else {
			throw err;
		}
	}

	if (!isRecord(rawData) || !Array.isArray(rawData.pets)) throw new Error("manifest response is invalid");
	return {
		generatedAt: cleanString(rawData.generatedAt) || undefined,
		total: typeof rawData.total === "number" ? rawData.total : rawData.pets.length,
		pets: rawData.pets
			.filter(isRecord)
			.map((pet) => ({
				slug: cleanString(pet.slug),
				displayName: cleanString(pet.displayName),
				kind: cleanString(pet.kind) || undefined,
				submittedBy: cleanString(pet.submittedBy) || undefined,
				spritesheetUrl: cleanString(pet.spritesheetUrl),
				petJsonUrl: cleanString(pet.petJsonUrl),
				zipUrl: cleanString(pet.zipUrl) || null,
			}))
			.filter((pet) => pet.slug && pet.displayName && pet.spritesheetUrl && pet.petJsonUrl),
	};
}

function extFromUrlOrType(url: string, contentType: string | null): ".webp" | ".png" {
	const ext = extname(new URL(url).pathname).toLowerCase();
	if (ext === ".png") return ".png";
	if (ext === ".webp") return ".webp";
	if (contentType?.includes("png")) return ".png";
	return ".webp";
}

async function downloadBytes(url: string): Promise<{ bytes: Buffer; contentType: string | null }> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${basename(new URL(url).pathname) || "asset"} download failed (${res.status})`);
	return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get("content-type") };
}

export async function installPetdexPet(slug: string): Promise<PetdexPet> {
	const manifest = await fetchPetdexManifest();
	const entry = manifest.pets.find((pet) => pet.slug === slug);
	if (!entry) {
		console.log(
			`[pi-pokepet] Pet "${slug}" not found in Petdex manifest. Trying community CLI install via npx codex-pets...`,
		);
		try {
			const { execSync } = await import("node:child_process");
			execSync(`npx -y codex-pets add ${slug}`, { stdio: "ignore" });

			const defaultPetsDir = join(homedir(), ".codex", "pets", slug);
			if (process.env.PI_POKEPET_PETDEX_DIR && existsSync(defaultPetsDir)) {
				const destDir = join(process.env.PI_POKEPET_PETDEX_DIR, slug);
				mkdirSync(destDir, { recursive: true });
				const petJson = readFileSync(join(defaultPetsDir, "pet.json"));
				writeFileSync(join(destDir, "pet.json"), petJson);

				const meta = JSON.parse(petJson.toString("utf8"));
				const spritePath = meta.spritesheetPath || "spritesheet.png";
				if (existsSync(join(defaultPetsDir, spritePath))) {
					writeFileSync(join(destDir, spritePath), readFileSync(join(defaultPetsDir, spritePath)));
				} else if (existsSync(join(defaultPetsDir, "spritesheet.webp"))) {
					writeFileSync(join(destDir, "spritesheet.webp"), readFileSync(join(defaultPetsDir, "spritesheet.webp")));
				}
			}
		} catch (err) {
			throw new Error(
				`Failed to install pet "${slug}" via community CLI: ${err instanceof Error ? err.message : String(err)}`,
			);
		}

		const pet = loadLocalPetdexPet(slug);
		if (!pet) throw new Error(`Installed pet "${slug}" via community CLI, but local validation failed`);
		return pet;
	}

	const [petJsonRes, spriteRes] = await Promise.all([
		downloadBytes(entry.petJsonUrl),
		downloadBytes(entry.spritesheetUrl),
	]);
	let metadata: PetdexMetadata;
	try {
		metadata = validatePetJson(JSON.parse(petJsonRes.bytes.toString("utf8")));
	} catch {
		metadata = {
			id: entry.slug,
			displayName: entry.displayName,
			description: `${entry.displayName} from Petdex.`,
			spritesheetPath: "spritesheet.webp",
		};
	}

	const ext = extFromUrlOrType(entry.spritesheetUrl, spriteRes.contentType);
	metadata = { ...metadata, id: entry.slug, displayName: entry.displayName, spritesheetPath: `spritesheet${ext}` };

	const dir = join(PETDEX_PETS_DIR, entry.slug);
	mkdirSync(dir, { recursive: true });
	rmSync(join(dir, "spritesheet.webp"), { force: true });
	rmSync(join(dir, "spritesheet.png"), { force: true });
	writeFileSync(join(dir, "pet.json"), `${JSON.stringify(metadata, null, 2)}\n`);
	writeFileSync(join(dir, metadata.spritesheetPath), spriteRes.bytes);

	const pet = loadLocalPetdexPet(entry.slug);
	if (!pet) throw new Error(`Installed ${entry.slug}, but local validation failed`);
	return pet;
}
