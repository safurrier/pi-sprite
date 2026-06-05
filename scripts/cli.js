#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execSync } = require("node:child_process");

const PETDEX_MANIFEST_URL = "https://petdex.crafter.run/api/manifest";
const PETDEX_PETS_DIR = process.env.PI_POKEPET_PETDEX_DIR || path.join(os.homedir(), ".codex", "pets");

async function main() {
	const args = process.argv.slice(2);
	const command = args[0];
	const slug = args[1];

	if (command !== "add" || !slug) {
		console.error("Usage: npx pi-pokepet add <slug>  (or npx pi-pets add <slug>)");
		process.exit(1);
	}

	console.log(`[pi-pokepet] Looking for pet "${slug}"...`);

	try {
		// Fetch manifest
		let manifest = null;
		try {
			const res = await fetch(PETDEX_MANIFEST_URL, { headers: { accept: "application/json" } });
			if (res.ok) {
				manifest = await res.json();
			}
		} catch (_e) {
			// ignore fetch error to trigger fallback below
		}

		const entry = manifest ? manifest.pets.find((p) => p.slug === slug) : null;
		if (!entry) {
			console.log(
				`[pi-pokepet] Pet "${slug}" not found in Petdex manifest (or server is offline). Falling back to community CLI via npx codex-pets...`,
			);
			execSync(`npx -y codex-pets add ${slug}`, { stdio: "inherit" });
			console.log(`[pi-pokepet] Successfully installed "${slug}" via community CLI.`);
			process.exit(0);
		}

		console.log(`[pi-pokepet] Downloading "${slug}" from Petdex...`);
		const targetDir = path.join(PETDEX_PETS_DIR, slug);
		fs.mkdirSync(targetDir, { recursive: true });

		// Download pet.json
		const petJsonRes = await fetch(entry.petJsonUrl);
		if (!petJsonRes.ok) throw new Error(`Failed to download pet.json: ${petJsonRes.status}`);
		const petJson = await petJsonRes.text();
		fs.writeFileSync(path.join(targetDir, "pet.json"), petJson);

		// Download spritesheet
		const spriteRes = await fetch(entry.spritesheetUrl);
		if (!spriteRes.ok) throw new Error(`Failed to download spritesheet: ${spriteRes.status}`);
		const spriteBuffer = Buffer.from(await spriteRes.arrayBuffer());

		// Determine filename
		let filename = "spritesheet.webp";
		try {
			const meta = JSON.parse(petJson);
			if (meta.spritesheetPath) {
				filename = meta.spritesheetPath;
			}
		} catch (_e) {}

		fs.writeFileSync(path.join(targetDir, filename), spriteBuffer);
		console.log(`[pi-pokepet] Successfully installed "${slug}" at ${targetDir}`);
	} catch (err) {
		console.error(`[pi-pokepet] Error during installation: ${err.message}`);
		process.exit(1);
	}
}

main();
