import assert from "node:assert/strict";
import test from "node:test";
import { getPetdexPet, listPetdexPets } from "../src/sprite/petdex.ts";

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

test("Petdex exact lookup searches the full manifest, not just first gallery page", async () => {
	await withFetch(manifest(35), async () => {
		const listed = await listPetdexPets();
		assert.equal(listed.length, 30);
		assert.equal(await getPetdexPet("pet-35").then((pet) => pet?.id), "pet-35");
	});
});
