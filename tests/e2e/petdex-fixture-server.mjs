#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";

const root = process.argv[2];
if (!root) {
	console.error("Usage: petdex-fixture-server.mjs <fixture-root>");
	process.exit(2);
}

const types = new Map([
	[".json", "application/json"],
	[".webp", "image/webp"],
	[".png", "image/png"],
]);

const server = createServer((req, res) => {
	const url = new URL(req.url ?? "/", "http://127.0.0.1");
	const baseUrl = `http://127.0.0.1:${server.address().port}`;
	if (url.pathname === "/manifest") {
		res.setHeader("content-type", "application/json");
		res.end(
			JSON.stringify({
				pets: [
					{
						slug: "e2e-petdex-pet",
						displayName: "E2E Petdex Pet",
						kind: "fixture",
						petJsonUrl: `${baseUrl}/pet.json`,
						spritesheetUrl: `${baseUrl}/spritesheet.webp`,
					},
				],
			}),
		);
		return;
	}
	const name = url.pathname.replace(/^\//u, "");
	try {
		const file = join(root, name);
		res.setHeader("content-type", types.get(extname(file)) ?? "application/octet-stream");
		res.end(readFileSync(file));
	} catch {
		res.statusCode = 404;
		res.end("not found");
	}
});

server.listen(0, "127.0.0.1", () => {
	const address = server.address();
	if (!address || typeof address === "string") process.exit(1);
	console.log(`http://127.0.0.1:${address.port}/manifest`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
