export function extractAssistantText(messages: unknown[]): string {
	for (const message of [...messages].reverse()) {
		const role = (message as { role?: string })?.role;
		if (role !== "assistant") continue;
		const content = (message as { content?: unknown })?.content;
		if (typeof content === "string") return content.trim();
		if (!Array.isArray(content)) continue;
		const text = content
			.map((part) =>
				part && typeof part === "object" && (part as { type?: string }).type === "text"
					? ((part as { text?: string }).text ?? "")
					: "",
			)
			.filter(Boolean)
			.join("\n")
			.trim();
		if (text) return text;
	}
	return "";
}
