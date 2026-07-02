import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { downloadToBuffer, parseSafeDownloadUrl } from "./download.ts";
import { type InstalledPet, importPetFolder, loadPet } from "./loader.ts";
import { petsDir } from "./paths.ts";

const DEFAULT_PETDEX_MANIFEST_URL = "https://petdex.crafter.run/api/manifest";

function petdexManifestUrl(): string {
	return process.env.PI_SPRITE_PETDEX_MANIFEST_URL || DEFAULT_PETDEX_MANIFEST_URL;
}

export interface GalleryPet {
	id: string;
	displayName: string;
	description?: string;
	source: "petdex";
	kind?: string;
	submittedBy?: string;
	petJsonUrl: string;
	spritesheetUrl: string;
	zipUrl?: string | null;
	installed: boolean;
}

interface PetdexManifestPet {
	slug: string;
	displayName: string;
	kind?: string;
	submittedBy?: string;
	petJsonUrl: string;
	spritesheetUrl: string;
	zipUrl?: string | null;
}

function clean(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function allowLocalhostHttpAssets(): boolean {
	const manifestUrl = parseSafeDownloadUrl(petdexManifestUrl(), { allowLocalhostHttp: true });
	return manifestUrl.protocol === "http:";
}

async function download(url: string): Promise<Buffer> {
	return await downloadToBuffer(url, { allowLocalhostHttp: allowLocalhostHttpAssets() });
}

async function manifestPets(): Promise<PetdexManifestPet[]> {
	const manifest = await downloadToBuffer(petdexManifestUrl(), {
		maxBytes: 2 * 1024 * 1024,
		allowLocalhostHttp: Boolean(process.env.PI_SPRITE_PETDEX_MANIFEST_URL),
	});
	const raw = JSON.parse(manifest.toString("utf8")) as { pets?: unknown[] };
	if (!Array.isArray(raw.pets)) throw new Error("Petdex manifest response is invalid");
	return raw.pets
		.filter((pet): pet is Record<string, unknown> => Boolean(pet && typeof pet === "object" && !Array.isArray(pet)))
		.map((pet) => ({
			slug: clean(pet.slug),
			displayName: clean(pet.displayName),
			kind: clean(pet.kind) || undefined,
			submittedBy: clean(pet.submittedBy) || undefined,
			petJsonUrl: clean(pet.petJsonUrl),
			spritesheetUrl: clean(pet.spritesheetUrl),
			zipUrl: clean(pet.zipUrl) || null,
		}))
		.filter((pet) => pet.slug && pet.displayName && pet.petJsonUrl && pet.spritesheetUrl);
}

function toGalleryPet(pet: PetdexManifestPet): GalleryPet {
	return {
		id: pet.slug,
		displayName: pet.displayName,
		source: "petdex",
		kind: pet.kind,
		submittedBy: pet.submittedBy,
		petJsonUrl: pet.petJsonUrl,
		spritesheetUrl: pet.spritesheetUrl,
		zipUrl: pet.zipUrl,
		installed: Boolean(loadPet(pet.slug)),
	};
}

export async function listPetdexPets(query = ""): Promise<GalleryPet[]> {
	const q = query.toLowerCase().trim();
	return (await manifestPets())
		.filter((pet) => !q || `${pet.slug} ${pet.displayName} ${pet.kind ?? ""}`.toLowerCase().includes(q))
		.slice(0, 30)
		.map(toGalleryPet);
}

export async function getPetdexPet(slug: string): Promise<GalleryPet | undefined> {
	const normalizedSlug = slug.toLowerCase().trim();
	const pet = (await manifestPets()).find((entry) => entry.slug.toLowerCase() === normalizedSlug);
	return pet ? toGalleryPet(pet) : undefined;
}

function spriteNameFromUrl(url: string): string {
	const ext = extname(new URL(url).pathname).toLowerCase();
	return ext === ".png" ? "spritesheet.png" : "spritesheet.webp";
}

export async function installPetdexPet(slug: string): Promise<InstalledPet> {
	const pet = await getPetdexPet(slug);
	if (!pet) throw new Error(`Petdex pet not found: ${slug}`);
	const allowLocalhostHttp = allowLocalhostHttpAssets();
	parseSafeDownloadUrl(pet.petJsonUrl, { allowLocalhostHttp });
	parseSafeDownloadUrl(pet.spritesheetUrl, { allowLocalhostHttp });
	const tmp = join(petsDir(), `.petdex-${pet.id}-${Date.now()}`);
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	try {
		const [petJson, spritesheet] = await Promise.all([download(pet.petJsonUrl), download(pet.spritesheetUrl)]);
		const spriteName = spriteNameFromUrl(pet.spritesheetUrl);
		let manifest: Record<string, unknown>;
		try {
			manifest = JSON.parse(petJson.toString("utf8")) as Record<string, unknown>;
		} catch {
			manifest = {};
		}
		manifest.id = pet.id;
		manifest.displayName = pet.displayName;
		manifest.name = pet.displayName;
		manifest.description =
			typeof manifest.description === "string" ? manifest.description : `${pet.displayName} from Petdex.`;
		manifest.spritesheetPath = spriteName;
		writeFileSync(join(tmp, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		writeFileSync(join(tmp, spriteName), spritesheet);
		return importPetFolder(tmp);
	} finally {
		if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
	}
}
