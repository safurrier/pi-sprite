import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, normalize, sep } from "node:path";
import AdmZip from "adm-zip";
import { normalizePetId, type PetManifest, parsePetManifest } from "./manifest.ts";
import { petsDir } from "./paths.ts";

export interface InstalledPet {
	id: string;
	dir: string;
	manifest: PetManifest;
}

const ALLOWED_IMPORT_EXTENSIONS = new Set([".json", ".png", ".webp", ".gif", ".jpg", ".jpeg", ".txt", ".md"]);
const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_TOTAL_SIZE = 25 * 1024 * 1024;
const MAX_IMPORT_FILES = 80;

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
	let total = 0;
	let count = 0;
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const fullPath = join(dir, entry.name);
			if (entry.isSymbolicLink()) throw new Error("pet imports may not contain symlinks");
			if (entry.isDirectory()) {
				walk(fullPath);
				continue;
			}
			count++;
			if (count > MAX_IMPORT_FILES) throw new Error("pet import contains too many files");
			const ext = extname(entry.name).toLowerCase();
			if (!ALLOWED_IMPORT_EXTENSIONS.has(ext))
				throw new Error(`pet import contains unsupported file type: ${entry.name}`);
			const size = statSync(fullPath).size;
			if (size > MAX_IMPORT_FILE_SIZE) throw new Error(`pet import file is too large: ${entry.name}`);
			total += size;
			if (total > MAX_IMPORT_TOTAL_SIZE) throw new Error("pet import is too large");
		}
	};
	walk(path);
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

function findZipRoot(tmp: string): string {
	if (existsSync(join(tmp, "pet.json"))) return tmp;
	const child = readdirSync(tmp, { withFileTypes: true }).find(
		(entry) => entry.isDirectory() && existsSync(join(tmp, entry.name, "pet.json")),
	);
	return child ? join(tmp, child.name) : tmp;
}

export function importPetZip(zipPath: string): InstalledPet {
	const zip = new AdmZip(zipPath);
	const entries = zip.getEntries();
	if (entries.length > MAX_IMPORT_FILES) throw new Error("pet zip contains too many files");
	let total = 0;
	const tmp = join(petsDir(), `.zip-${Date.now()}`);
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });
	try {
		for (const entry of entries) {
			const normalized = normalize(entry.entryName);
			if (
				!normalized ||
				normalized === "." ||
				isAbsolute(normalized) ||
				normalized.startsWith("..") ||
				normalized.includes(`..${sep}`)
			) {
				throw new Error("pet zip contains path traversal");
			}
			if (entry.isDirectory) continue;
			const ext = extname(normalized).toLowerCase();
			if (!ALLOWED_IMPORT_EXTENSIONS.has(ext))
				throw new Error(`pet zip contains unsupported file type: ${entry.entryName}`);
			const data = entry.getData();
			if (data.length > MAX_IMPORT_FILE_SIZE) throw new Error(`pet zip file is too large: ${entry.entryName}`);
			total += data.length;
			if (total > MAX_IMPORT_TOTAL_SIZE) throw new Error("pet zip is too large");
			const destination = join(tmp, normalized);
			mkdirSync(join(destination, ".."), { recursive: true });
			writeFileSync(destination, data);
		}
		return importPetFolder(findZipRoot(tmp));
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}
