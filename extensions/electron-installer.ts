/**
 * Self-healing Electron runtime bootstrap.
 *
 * pi installs extension packages with `npm install -g --ignore-scripts`, which
 * means Electron's postinstall (the step that downloads the ~100MB platform
 * binary) never runs. This module detects that situation at runtime and repairs
 * it on demand — without any install-time hook — so users only have to run
 * `pi update` and the companion fixes itself on next launch.
 *
 * Strategy:
 *   1. Run Electron's own `install.js` (uses @electron/get + a shared cache).
 *   2. Fall back to `npm install electron@<version> --no-save` if the wrapper
 *      package itself is missing/broken.
 *
 * Everything is best-effort: if the runtime can't be provisioned (offline,
 * headless, sandboxed), callers fall back to the ASCII pet.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

/** Linux needs a display server; macOS/Windows always have one. */
export function hasDisplay(): boolean {
	if (process.platform !== "linux") return true;
	return Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

/**
 * Resolve the *verified* absolute path to the Electron executable inside
 * `packageDir`, or null if the binary has not been downloaded yet.
 *
 * We intentionally do not trust the `.bin/electron` shim alone — it can exist
 * while the real binary (referenced by `path.txt`) is absent.
 */
export function resolveElectronBinary(packageDir: string): string | null {
	const electronPkgDir = join(packageDir, "node_modules", "electron");
	const pathTxt = join(electronPkgDir, "path.txt");
	if (!existsSync(pathTxt)) return null;
	try {
		const rel = readFileSync(pathTxt, "utf8").trim();
		if (!rel) return null;
		const bin = join(electronPkgDir, "dist", rel);
		return existsSync(bin) ? bin : null;
	} catch {
		return null;
	}
}

/** Best-effort Electron version: installed wrapper > declared range > pinned default. */
export function getElectronVersion(packageDir: string): string {
	try {
		const v = JSON.parse(readFileSync(join(packageDir, "node_modules", "electron", "package.json"), "utf8")).version;
		if (typeof v === "string" && v) return v;
	} catch {
		// fall through
	}
	try {
		const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
		const range: string = pkg.dependencies?.electron || pkg.devDependencies?.electron || "";
		const cleaned = range.replace(/^[^0-9]*/, "").trim();
		if (cleaned) return cleaned;
	} catch {
		// fall through
	}
	return "42.3.3";
}

function spawnOnce(cmd: string, args: string[], cwd: string, log: (msg: string) => void): Promise<boolean> {
	return new Promise((resolve) => {
		// npm reads these lowercase env keys as config overrides. Forcing
		// ignore-scripts off guarantees Electron's binary download runs even if
		// the user's ~/.npmrc has scripts globally disabled.
		const env: NodeJS.ProcessEnv = { ...process.env };
		env.npm_config_ignore_scripts = "false";
		env.npm_config_audit = "false";
		env.npm_config_fund = "false";
		env.npm_config_progress = "false";

		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(cmd, args, {
				cwd,
				env,
				stdio: "ignore",
			});
		} catch (err) {
			log(`spawn failed: ${err instanceof Error ? err.message : String(err)}`);
			resolve(false);
			return;
		}

		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {
				// ignore
			}
			log("setup timed out");
			resolve(false);
		}, INSTALL_TIMEOUT_MS);

		child.on("error", (err) => {
			clearTimeout(timer);
			log(`setup error: ${err.message}`);
			resolve(false);
		});
		child.on("exit", (code) => {
			clearTimeout(timer);
			resolve(code === 0);
		});
	});
}

// Single in-flight install shared across every render call.
let installPromise: Promise<boolean> | null = null;

/**
 * Ensure the Electron binary exists in `packageDir`, downloading it once if
 * needed. Resolves true when a verified binary is available.
 */
export function ensureElectronBinary(opts: { packageDir: string; log: (msg: string) => void }): Promise<boolean> {
	const { packageDir, log } = opts;

	if (resolveElectronBinary(packageDir)) return Promise.resolve(true);
	if (installPromise) return installPromise;

	installPromise = (async () => {
		const version = getElectronVersion(packageDir);
		const electronPkgDir = join(packageDir, "node_modules", "electron");
		const installScript = join(electronPkgDir, "install.js");

		// Strategy 1: wrapper present (electron is a dependency) → run its own
		// downloader. Fast, cache-aware, works even with npm scripts disabled.
		if (existsSync(installScript)) {
			log(`downloading Electron ${version} runtime (one-time)...`);
			const ok = await spawnOnce(process.execPath, [installScript], electronPkgDir, log);
			if (ok && resolveElectronBinary(packageDir)) {
				log("Electron runtime ready.");
				return true;
			}
		}

		// Strategy 2: wrapper missing/broken → full install into the package dir.
		const npm = process.platform === "win32" ? "npm.cmd" : "npm";
		log(`installing Electron ${version} (one-time)...`);
		const ok = await spawnOnce(
			npm,
			["install", `electron@${version}`, "--no-save", "--no-audit", "--no-fund"],
			packageDir,
			log,
		);
		if (ok && resolveElectronBinary(packageDir)) {
			log("Electron runtime ready.");
			return true;
		}

		log("Electron setup did not complete; staying in ASCII mode.");
		return false;
	})();

	return installPromise;
}

/** Allow `/pet setup` to retry after a previous failure. */
export function resetElectronInstallState(): void {
	installPromise = null;
}
