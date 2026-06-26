import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const skillRoot = "skills/pi-sprite-authoring";

test("package exposes the pi-sprite authoring skill", () => {
	const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
		pi?: { skills?: string[] };
		files?: string[];
	};
	assert.deepEqual(packageJson.pi?.skills, ["./skills"]);
	assert.ok(packageJson.files?.includes("skills"));
	assert.ok(existsSync(join(skillRoot, "SKILL.md")));
});

test("pi-sprite authoring skill has discoverable metadata and resources", () => {
	const skill = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
	assert.match(skill, /^---\nname: pi-sprite-authoring\n/m);
	assert.match(skill, /Wumpus sprites/u);
	assert.match(skill, /references\/wumpus-sprite-prompts\.md/u);
	assert.ok(existsSync(join(skillRoot, "references", "wumpus-sprite-prompts.md")));
	assert.ok(existsSync(join(skillRoot, "assets", "wumpus-template", "pet.json")));
	assert.ok(existsSync(join(skillRoot, "scripts", "create-pet-template.mjs")));
	assert.ok(existsSync(join(skillRoot, "scripts", "download-petdex-examples.mjs")));
});

test("create-pet-template script writes an importable Wumpus manifest", async () => {
	const out = mkdtempSync(join(tmpdir(), "pi-sprite-skill-"));
	try {
		const { spawnSync } = await import("node:child_process");
		const result = spawnSync(
			"node",
			[join(skillRoot, "scripts", "create-pet-template.mjs"), "--id", "Wumpus!!", "--name", "Wumpus", "--out", out],
			{ encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stderr);
		const manifest = JSON.parse(readFileSync(join(out, "pet.json"), "utf8"));
		assert.equal(manifest.id, "wumpus");
		assert.equal(manifest.name, "Wumpus");
		assert.equal(manifest.sprites.idle, "idle.png");
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});

test("Petdex downloader ignores unsafe manifest slugs", async () => {
	const out = mkdtempSync(join(tmpdir(), "pi-sprite-petdex-"));
	const outside = join(out, "..", "escape");
	const server = createServer((req, res) => {
		const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
		if (req.url === "/manifest") {
			res.setHeader("content-type", "application/json");
			res.end(
				JSON.stringify({
					pets: [
						{
							slug: "../escape",
							displayName: "Bad",
							petJsonUrl: `${base}/pet.json`,
							spritesheetUrl: `${base}/sprite.webp`,
						},
						{
							slug: "safe-pet",
							displayName: "Safe Pet",
							petJsonUrl: `${base}/pet.json`,
							spritesheetUrl: `${base}/sprite.webp`,
						},
					],
				}),
			);
			return;
		}
		if (req.url === "/pet.json") {
			res.setHeader("content-type", "application/json");
			res.end('{"id":"safe-pet","spritesheetPath":"spritesheet.webp"}');
			return;
		}
		res.end("sprite");
	});
	try {
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { spawn } = await import("node:child_process");
		const result = await new Promise<{ status: number | null; stderr: string }>((resolve) => {
			const child = spawn(
				"node",
				[
					join(skillRoot, "scripts", "download-petdex-examples.mjs"),
					"--manifest",
					`http://127.0.0.1:${(server.address() as { port: number }).port}/manifest`,
					"--out",
					out,
					"--limit",
					"5",
				],
				{ stdio: ["ignore", "ignore", "pipe"] },
			);
			let stderr = "";
			child.stderr.on("data", (chunk) => {
				stderr += chunk.toString();
			});
			child.on("exit", (status) => resolve({ status, stderr }));
		});
		assert.equal(result.status, 0, result.stderr);
		assert.equal(existsSync(join(out, "safe-pet", "pet.json")), true);
		assert.equal(existsSync(outside), false);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
		rmSync(out, { recursive: true, force: true });
		rmSync(outside, { recursive: true, force: true });
	}
});
