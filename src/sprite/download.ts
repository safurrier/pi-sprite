export const DEFAULT_DOWNLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const DEFAULT_DOWNLOAD_TIMEOUT_MS = 30_000;

export interface DownloadOptions {
	maxBytes?: number;
	timeoutMs?: number;
	allowLocalhostHttp?: boolean;
}

function isLocalhost(hostname: string): boolean {
	const normalized = hostname.replace(/^\[(.*)\]$/u, "$1");
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function parseSafeDownloadUrl(urlText: string, options: DownloadOptions = {}): URL {
	const url = new URL(urlText);
	if (url.protocol === "https:") return url;
	if (options.allowLocalhostHttp && url.protocol === "http:" && isLocalhost(url.hostname)) return url;
	throw new Error("pet downloads require an https URL");
}

function contentLength(response: Response): number | undefined {
	const value = response.headers.get("content-length");
	if (!value) return undefined;
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

async function readResponseBody(response: Response, maxBytes: number): Promise<Buffer> {
	if (!response.body) {
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.length > maxBytes) throw new Error("download is too large");
		return bytes;
	}
	const reader = response.body.getReader();
	const chunks: Buffer[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = Buffer.from(value);
			total += chunk.length;
			if (total > maxBytes) throw new Error("download is too large");
			chunks.push(chunk);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, total);
}

export async function downloadToBuffer(urlText: string, options: DownloadOptions = {}): Promise<Buffer> {
	const maxBytes = options.maxBytes ?? DEFAULT_DOWNLOAD_MAX_BYTES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT_MS;
	const url = parseSafeDownloadUrl(urlText, options);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(url, { headers: { accept: "*/*" }, signal: controller.signal });
		if (response.url) parseSafeDownloadUrl(response.url, options);
		if (!response.ok) throw new Error(`download failed for ${url.href} (${response.status})`);
		const declaredLength = contentLength(response);
		if (declaredLength !== undefined && declaredLength > maxBytes) throw new Error("download is too large");
		return await readResponseBody(response, maxBytes);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") throw new Error("download timed out");
		throw error;
	} finally {
		clearTimeout(timer);
	}
}
