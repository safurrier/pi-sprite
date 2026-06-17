import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerBtwCommands } from "../src/btw/index.ts";
import { registerContextCommand } from "../src/context/index.ts";
import { registerRecapCommand } from "../src/recap/index.ts";
import { createSpriteRuntime } from "../src/sprite/runtime.ts";

export default function piSpriteExtension(pi: ExtensionAPI) {
	const sprite = createSpriteRuntime();

	pi.on("session_start", async (_event: unknown, ctx: ExtensionContext) => {
		await sprite.start(ctx);
	});
	pi.on("agent_start", async () => sprite.setState("thinking"));
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
	pi.on("agent_end", async () => sprite.setState("success", { resetMs: 1800 }));
	pi.on("session_shutdown", async () => sprite.shutdown());

	sprite.registerCommands(pi);
	registerContextCommand(pi);
	registerRecapCommand(pi);
	registerBtwCommands(pi);
}
