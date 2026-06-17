import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { normalizePetId, type PetManifest, parsePetManifest } from "./manifest.ts";
import { petsDir } from "./paths.ts";

export interface InstalledPet {
	id: string;
	dir: string;
	manifest: PetManifest;
}

export function ensurePetDirs(): void {
	mkdirSync(petsDir(), { recursive: true });
}

export function loadPet(id: string): InstalledPet | undefined {
	const safeId = normalizePetId(id);
	if (!safeId) return undefined;
	const dir = join(petsDir(), safeId);
	const manifestPath = join(dir, "pet.json");
	if (!existsSync(manifestPath)) return undefined;
	try {
		const manifest = parsePetManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
		return { id: manifest.id, dir, manifest };
	} catch {
		return undefined;
	}
}

export function listPets(): InstalledPet[] {
	ensurePetDirs();
	return readdirSync(petsDir(), { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => loadPet(entry.name))
		.filter((pet): pet is InstalledPet => Boolean(pet))
		.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

function validateImportSource(path: string): void {
	if (!existsSync(path) || !statSync(path).isDirectory())
		throw new Error("/pet import currently expects a local folder");
	if (!existsSync(join(path, "pet.json"))) throw new Error("pet folder must contain pet.json");
}

export function importPetFolder(sourcePath: string): InstalledPet {
	validateImportSource(sourcePath);
	const manifest = parsePetManifest(JSON.parse(readFileSync(join(sourcePath, "pet.json"), "utf8")));
	const destination = join(petsDir(), manifest.id);
	mkdirSync(petsDir(), { recursive: true });
	const tempDestination = join(petsDir(), `.tmp-${manifest.id}-${Date.now()}`);
	rmSync(tempDestination, { recursive: true, force: true });
	cpSync(sourcePath, tempDestination, { recursive: true, verbatimSymlinks: false });
	writeFileSync(join(tempDestination, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`);
	rmSync(destination, { recursive: true, force: true });
	cpSync(tempDestination, destination, { recursive: true });
	rmSync(tempDestination, { recursive: true, force: true });
	const installed = loadPet(manifest.id);
	if (!installed) throw new Error(`Imported ${basename(sourcePath)}, but validation failed`);
	return installed;
}
