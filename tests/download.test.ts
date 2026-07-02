import assert from "node:assert/strict";
import test from "node:test";
import { downloadToBuffer, parseSafeDownloadUrl } from "../src/sprite/download.ts";

async function withFetch(fetchImpl: typeof fetch, fn: () => Promise<void>) {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = fetchImpl;
	try {
		await fn();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

test("pet downloads require https unless localhost is explicitly allowed", () => {
	assert.throws(() => parseSafeDownloadUrl("http://example.com/pet.zip"), /https URL/u);
	assert.equal(parseSafeDownloadUrl("https://example.com/pet.zip").protocol, "https:");
	assert.equal(
		parseSafeDownloadUrl("http://127.0.0.1:3000/pet.zip", { allowLocalhostHttp: true }).hostname,
		"127.0.0.1",
	);
	assert.equal(parseSafeDownloadUrl("http://[::1]:3000/pet.zip", { allowLocalhostHttp: true }).hostname, "[::1]");
});

test("download rejects oversized content-length before accepting body", async () => {
	await withFetch(
		(async () => new Response(Buffer.from("too large"), { headers: { "content-length": "10" } })) as typeof fetch,
		async () => {
			await assert.rejects(
				() => downloadToBuffer("https://example.com/pet.zip", { maxBytes: 4 }),
				/download is too large/u,
			);
		},
	);
});

test("download rejects oversized streamed bodies", async () => {
	await withFetch((async () => new Response(Buffer.from("too large"))) as typeof fetch, async () => {
		await assert.rejects(
			() => downloadToBuffer("https://example.com/pet.zip", { maxBytes: 3 }),
			/download is too large/u,
		);
	});
});

test("download revalidates the final response URL after redirects", async () => {
	await withFetch(
		(async () => {
			const response = new Response(Buffer.from("zip"));
			Object.defineProperty(response, "url", { value: "http://example.com/pet.zip" });
			return response;
		}) as typeof fetch,
		async () => {
			await assert.rejects(
				() => downloadToBuffer("https://example.com/pet.zip"),
				/pet downloads require an https URL/u,
			);
		},
	);
});

test("download reports timeout when fetch is aborted", async () => {
	await withFetch(
		((_url, init) =>
			new Promise((_resolve, reject) => {
				const signal = init?.signal;
				if (!signal) return;
				signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
			})) as typeof fetch,
		async () => {
			await assert.rejects(
				() => downloadToBuffer("https://example.com/pet.zip", { timeoutMs: 1 }),
				/download timed out/u,
			);
		},
	);
});
