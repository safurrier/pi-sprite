import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerBtwCommands } from "../src/btw/index.ts";
import { registerContextCommand } from "../src/context/index.ts";
import { registerRecapCommand } from "../src/recap/index.ts";
import { classifyLiveTurnStatus } from "../src/sprite/live-status.ts";
import { createSpriteRuntime } from "../src/sprite/runtime.ts";
import { classifyTurnStatus } from "../src/sprite/turn-status.ts";

export const LIVE_STATUS_INTERVAL_MS = 5 * 60 * 1000;

export default function piSpriteExtension(pi: ExtensionAPI) {
	const sprite = createSpriteRuntime();
	let turnStatusRun = 0;
	let liveStatusTimer: ReturnType<typeof setTimeout> | undefined;
	let liveStatusInFlight = false;

	function clearLiveStatusTimer(): void {
		if (liveStatusTimer) clearTimeout(liveStatusTimer);
		liveStatusTimer = undefined;
	}

	function scheduleLiveStatus(ctx: ExtensionContext, run: number): void {
		clearLiveStatusTimer();
		if (!sprite.isLiveStatusEnabled()) return;
		liveStatusTimer = setTimeout(() => {
			void updateLiveStatus(ctx, run);
		}, LIVE_STATUS_INTERVAL_MS);
	}

	async function updateLiveStatus(ctx: ExtensionContext, run: number): Promise<void> {
		liveStatusTimer = undefined;
		if (run !== turnStatusRun || !sprite.isLiveStatusEnabled()) return;
		if (liveStatusInFlight) return scheduleLiveStatus(ctx, run);
		liveStatusInFlight = true;
		const liveGeneration = sprite.setLiveStatusPending();
		let status: Awaited<ReturnType<typeof classifyLiveTurnStatus>>;
		try {
			status = await classifyLiveTurnStatus(ctx);
		} catch {
			status = undefined;
		} finally {
			liveStatusInFlight = false;
		}
		if (run === turnStatusRun) sprite.setLiveStatus(status, liveGeneration);
		if (run === turnStatusRun) scheduleLiveStatus(ctx, run);
	}

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		await sprite.start(ctx);
	});
	pi.on("agent_start", async (_event: unknown, ctx: ExtensionContext) => {
		const run = ++turnStatusRun;
		clearLiveStatusTimer();
		sprite.clearTurnStatus();
		sprite.clearLiveStatus();
		sprite.setState("thinking");
		scheduleLiveStatus(ctx, run);
	});
	pi.on("message_update", async (event: unknown) => {
		const type = (event as { assistantMessageEvent?: { type?: string } })?.assistantMessageEvent?.type ?? "";
		if (/^thinking/u.test(type)) sprite.setState("thinking");
		else if (/^toolcall/u.test(type)) sprite.setState("working");
	});
	pi.on("tool_execution_start", async () => sprite.setState("working"));
	pi.on("tool_result", async (event: unknown) => {
		const e = event as { isError?: boolean; result?: { isError?: boolean }; error?: unknown };
		if (e?.isError || e?.result?.isError || e?.error) sprite.setState("error", { resetMs: 2500 });
	});
	pi.on("agent_end", async (event: unknown, ctx: ExtensionContext) => {
		const run = ++turnStatusRun;
		clearLiveStatusTimer();
		sprite.clearLiveStatus();
		sprite.setState("success", { resetMs: 1800 });
		if (!sprite.isTurnStatusEnabled()) return;
		sprite.setTurnStatusPending();
		const status = await classifyTurnStatus(ctx, (event as { messages?: unknown[] }).messages ?? []);
		if (run === turnStatusRun) sprite.setTurnStatus(status);
	});
	pi.on("session_shutdown", async () => {
		turnStatusRun++;
		clearLiveStatusTimer();
		sprite.clearLiveStatus();
		sprite.shutdown();
	});

	sprite.registerCommands(pi);
	registerContextCommand(pi);
	registerRecapCommand(pi, {
		setState: (state, options) => sprite.setState(state, options),
		setRecapStatus: (status) => sprite.setRecapStatus(status),
		getBubblePlacement: () => sprite.getBubblePlacement(),
		getSpriteName: () => sprite.getSpriteName(),
	});
	registerBtwCommands(pi, {
		setState: (state, options) => sprite.setState(state, options),
		setBtwStatus: (status, count) => sprite.setBtwStatus(status, count),
		getBubblePlacement: () => sprite.getBubblePlacement(),
		getSpriteName: () => sprite.getSpriteName(),
		getSpritePersonality: () => sprite.getSpritePersonality(),
	});
}
