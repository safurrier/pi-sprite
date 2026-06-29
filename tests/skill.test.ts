import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	assert.match(skill, /Wumpus or Petdex-inspired sprites/u);
	assert.match(skill, /references\/wumpus-sprite-prompts\.md/u);
	assert.match(skill, /references\/petdex-reference-to-custom-pet\.md/u);
	assert.match(skill, /references\/gpt-image-sprite-workflow\.md/u);
	assert.match(skill, /references\/character-cohesion-review\.md/u);
	assert.match(skill, /scripts\/openai_sprite_image\.py/u);
	assert.match(skill, /scripts\/remove_sprite_background\.py/u);
	assert.ok(existsSync(join(skillRoot, "references", "wumpus-sprite-prompts.md")));
	assert.ok(existsSync(join(skillRoot, "references", "petdex-reference-to-custom-pet.md")));
	assert.ok(existsSync(join(skillRoot, "references", "gpt-image-sprite-workflow.md")));
	assert.ok(existsSync(join(skillRoot, "references", "character-cohesion-review.md")));
	assert.ok(existsSync(join(skillRoot, "assets", "wumpus-template", "pet.json")));
	assert.ok(existsSync(join(skillRoot, "scripts", "create-pet-template.mjs")));
	assert.ok(existsSync(join(skillRoot, "scripts", "download-petdex-examples.mjs")));
	assert.ok(existsSync(join(skillRoot, "scripts", "openai_sprite_image.py")));
	assert.ok(existsSync(join(skillRoot, "scripts", "remove_sprite_background.py")));
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

test("background cleanup helper exposes agent-friendly help", async () => {
	const { spawnSync } = await import("node:child_process");
	const script = join(skillRoot, "scripts", "remove_sprite_background.py");
	const help = spawnSync("python3", [script, "--help"], { encoding: "utf8" });
	assert.equal(help.status, 0, help.stderr);
	assert.match(help.stdout, /Remove an edge-connected background/u);
});

test("OpenAI sprite helper supports help and dry-run metadata without an API key", async () => {
	const out = mkdtempSync(join(tmpdir(), "pi-sprite-openai-helper-"));
	const reference = join(out, "reference.png");
	try {
		writeFileSync(
			reference,
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
				"base64",
			),
		);
		const { spawnSync } = await import("node:child_process");
		const script = join(skillRoot, "scripts", "openai_sprite_image.py");
		const help = spawnSync("python3", [script, "--help"], { encoding: "utf8" });
		assert.equal(help.status, 0, help.stderr);
		assert.match(help.stdout, /Generate a pi-sprite image/u);

		const previousKey = process.env.OPENAI_API_KEY;
		delete process.env.OPENAI_API_KEY;
		try {
			const result = spawnSync(
				"python3",
				[
					script,
					"--dry-run",
					"--prompt",
					"Create a tiny transparent pixel-art idle sprite.",
					"--reference-image",
					reference,
					"--reference-role",
					"style_reference",
					"--reference-instruction",
					"Use for silhouette scale only; do not copy identity.",
					"--output-dir",
					out,
					"--prefix",
					"idle",
				],
				{ encoding: "utf8" },
			);
			assert.equal(result.status, 0, result.stderr);
			const metadataLine = result.stdout.split("\n").find((line) => line.startsWith("metadata: "));
			assert.ok(metadataLine);
			const metadataPath = metadataLine.replace("metadata: ", "").trim();
			const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
			assert.equal(metadata.dry_run, true);
			assert.equal(metadata.method, "edit");
			assert.equal(metadata.background, "auto");
			assert.equal(metadata.image_path, null);
			assert.equal(metadata.references[0].path, reference);
			assert.equal(metadata.references[0].role, "style_reference");
			assert.match(metadata.references[0].instruction, /silhouette scale/u);
		} finally {
			if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
			else process.env.OPENAI_API_KEY = previousKey;
		}
	} finally {
		rmSync(out, { recursive: true, force: true });
	}
});
