import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getPetdexPet, installPetdexPet, listPetdexPets } from "../src/sprite/petdex.ts";

function manifest(size: number) {
	return {
		pets: Array.from({ length: size }, (_, idx) => ({
			slug: `pet-${idx + 1}`,
			displayName: `Pet ${idx + 1}`,
			petJsonUrl: `https://example.test/pet-${idx + 1}.json`,
			spritesheetUrl: `https://example.test/pet-${idx + 1}.webp`,
		})),
	};
}

function withFetch(payload: unknown, fn: () => Promise<void>) {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(payload), {
			status: 200,
			headers: { "content-type": "application/json" },
		})) as typeof fetch;
	return fn().finally(() => {
		globalThis.fetch = originalFetch;
	});
}

function withHome<T>(fn: () => Promise<T>): Promise<T> {
	const dir = mkdtempSync(join(tmpdir(), "pi-sprite-petdex-"));
	const oldHome = process.env.PI_SPRITE_HOME;
	process.env.PI_SPRITE_HOME = dir;
	return fn().finally(() => {
		if (oldHome === undefined) delete process.env.PI_SPRITE_HOME;
		else process.env.PI_SPRITE_HOME = oldHome;
		rmSync(dir, { recursive: true, force: true });
	});
}

test("Petdex exact lookup searches the full manifest, not just first gallery page", async () => {
	await withFetch(manifest(35), async () => {
		const listed = await listPetdexPets();
		assert.equal(listed.length, 30);
		assert.equal(await getPetdexPet("pet-35").then((pet) => pet?.id), "pet-35");
	});
});

test("Petdex install rejects non-https manifest asset URLs", async () => {
	await withHome(async () => {
		await withFetch(
			{
				pets: [
					{
						slug: "unsafe-pet",
						displayName: "Unsafe Pet",
						petJsonUrl: "http://example.test/pet.json",
						spritesheetUrl: "https://example.test/spritesheet.webp",
					},
				],
			},
			async () => {
				await assert.rejects(() => installPetdexPet("unsafe-pet"), /https URL/u);
			},
		);
	});
});
