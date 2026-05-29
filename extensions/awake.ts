/**
 * Cross-platform "keep the system awake" helper.
 *
 * Spawns the OS's native idle/sleep inhibitor as a child process and keeps it
 * alive until released. No third-party dependencies — just Node's child_process
 * plus the tool each platform already ships:
 *
 *   macOS    caffeinate            (-dimsu: display, idle, disk, system, user)
 *   Linux    systemd-inhibit       (--what=idle:sleep, mode=block)
 *   Windows  SetThreadExecutionState via PowerShell
 *
 * Every spawned helper is tied to pi's own PID, so if pi exits or crashes the
 * inhibitor notices and exits too — the machine is never left awake forever.
 */

import { type ChildProcess, spawn } from "node:child_process";

let proc: ChildProcess | null = null;
let active = false;
let method = "";
let reasonText = "";

export interface AwakeResult {
	/** The inhibitor process started without throwing. */
	ok: boolean;
	/** Human-readable mechanism name (e.g. "caffeinate"). */
	method: string;
	/** Whether this platform is supported at all. */
	supported: boolean;
}

/** Build the platform-specific spawn spec, tied to pi's PID for safe cleanup. */
function buildSpawn(reason: string): { cmd: string; args: string[]; label: string } | null {
	const why = reason || "pi-pokepet keep-awake";
	const pid = process.pid;

	switch (process.platform) {
		case "darwin":
			// -w <pid>: caffeinate exits when pi exits, releasing the lock.
			return { cmd: "caffeinate", args: ["-dimsu", "-w", String(pid)], label: "caffeinate" };

		case "linux":
			// The inhibitor lock is held only while this child runs; the bash loop
			// exits as soon as pi's PID is gone.
			return {
				cmd: "systemd-inhibit",
				args: [
					"--what=idle:sleep",
					"--who=pi-pokepet",
					`--why=${why}`,
					"--mode=block",
					"bash",
					"-c",
					`while kill -0 ${pid} 2>/dev/null; do sleep 5; done`,
				],
				label: "systemd-inhibit",
			};

		case "win32": {
			// ES_CONTINUOUS (0x80000000) | ES_SYSTEM_REQUIRED (0x1) | ES_DISPLAY_REQUIRED (0x2)
			// The flag is bound to this thread; when the process exits it clears itself.
			const ps = [
				"$s='[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint e);';",
				"$t=Add-Type -MemberDefinition $s -Name P -Namespace W -PassThru;",
				"$t::SetThreadExecutionState(0x80000003) | Out-Null;",
				`while(Get-Process -Id ${pid} -ErrorAction SilentlyContinue){Start-Sleep -Seconds 30}`,
			].join(" ");
			return {
				cmd: "powershell.exe",
				args: ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ps],
				label: "SetThreadExecutionState",
			};
		}

		default:
			return null;
	}
}

/**
 * Start keeping the system awake. Idempotent — calling again while active just
 * updates the stored reason. `onError` fires if the inhibitor binary is missing
 * or the process dies unexpectedly.
 */
export function startAwake(reason: string, onError?: (msg: string) => void): AwakeResult {
	reasonText = reason;
	if (active && proc) return { ok: true, method, supported: true };

	const spec = buildSpawn(reason);
	if (!spec) return { ok: false, method: "", supported: false };

	try {
		proc = spawn(spec.cmd, spec.args, { stdio: "ignore", detached: false });
		method = spec.label;
		active = true;

		proc.on("error", () => {
			active = false;
			proc = null;
			onError?.(`couldn't keep awake — '${spec.cmd}' not available on this system`);
		});
		proc.on("exit", () => {
			// Unexpected exit (or our own kill): reflect that we're no longer holding.
			active = false;
			proc = null;
		});

		return { ok: true, method: spec.label, supported: true };
	} catch {
		active = false;
		proc = null;
		return { ok: false, method: "", supported: true };
	}
}

/** Release the lock and let the system sleep normally again. */
export function stopAwake(): void {
	if (proc) {
		try {
			proc.kill();
		} catch {
			/* best-effort */
		}
	}
	proc = null;
	active = false;
	method = "";
	reasonText = "";
}

export function isAwake(): boolean {
	return active;
}

export function awakeInfo(): { active: boolean; method: string; reason: string } {
	return { active, method, reason: reasonText };
}
