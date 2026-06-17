import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { importPetFolder, importPetZip } from "../src/sprite/loader.ts";

function withHome<T>(fn: (dir: string) => T): T {
	const dir = mkdtempSync(join(tmpdir(), "pi-sprite-test-"));
	const oldHome = process.env.PI_SPRITE_HOME;
	process.env.PI_SPRITE_HOME = dir;
	try {
		return fn(dir);
	} finally {
		if (oldHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = oldHome;
		rmSync(dir, { recursive: true, force: true });
	}
}

test("imports a safe local pet folder", () =>
	withHome(() => {
		const src = mkdtempSync(join(tmpdir(), "pet-src-"));
		try {
			writeFileSync(
				join(src, "pet.json"),
				JSON.stringify({ id: "safe-pet", name: "Safe", sprites: { idle: "idle.png" } }),
			);
			writeFileSync(join(src, "idle.png"), "placeholder");
			const pet = importPetFolder(src);
			assert.equal(pet.id, "safe-pet");
		} finally {
			rmSync(src, { recursive: true, force: true });
		}
	}));

test("rejects unsupported local import files", () =>
	withHome(() => {
		const src = mkdtempSync(join(tmpdir(), "pet-src-"));
		try {
			writeFileSync(join(src, "pet.json"), JSON.stringify({ id: "bad-pet", sprites: { idle: "idle.png" } }));
			writeFileSync(join(src, "idle.png"), "placeholder");
			writeFileSync(join(src, "run.sh"), "echo nope");
			assert.throws(() => importPetFolder(src), /unsupported file type/u);
		} finally {
			rmSync(src, { recursive: true, force: true });
		}
	}));

test("rejects unsupported files inside zip imports", () =>
	withHome(() => {
		const zipPath = join(tmpdir(), `bad-${Date.now()}.zip`);
		const zip = new AdmZip();
		zip.addFile("pet.json", Buffer.from(JSON.stringify({ id: "bad-zip", sprites: { idle: "idle.png" } })));
		zip.addFile("idle.png", Buffer.from("placeholder"));
		zip.addFile("run.sh", Buffer.from("echo nope"));
		zip.writeZip(zipPath);
		try {
			assert.throws(() => importPetZip(zipPath), /unsupported file type/u);
		} finally {
			rmSync(zipPath, { force: true });
		}
	}));
