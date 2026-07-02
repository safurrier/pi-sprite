import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((p) => (p?.type === "text" ? p.text : ""))
		.filter(Boolean)
		.join("\n");
}

export function sessionConversationText(ctx: ExtensionCommandContext): string {
	const lines: string[] = [];
	for (const entry of ctx.sessionManager.getBranch() as Iterable<any>) {
		if (entry.type !== "message") continue;
		const role = entry.message?.role;
		if (role !== "user" && role !== "assistant") continue;
		const text = extractText(entry.message.content).trim();
		if (text) lines.push(`${role}: ${text.slice(0, 1200)}`);
	}
	return lines.slice(-16).join("\n\n");
}
