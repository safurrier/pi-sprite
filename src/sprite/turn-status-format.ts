export type TurnStatusState = "done" | "followup" | "blocked";

export interface TurnStatus {
	state: TurnStatusState;
	label: string;
	detail?: string;
	actions?: string[];
}

const STATE_EMOJI: Record<TurnStatusState, string> = {
	done: "🟢",
	followup: "🟡",
	blocked: "🔴",
};

export function emojiForTurnStatus(state: TurnStatusState): string {
	return STATE_EMOJI[state];
}

function trimToChars(text: string, maxChars: number): string {
	const compact = text.replace(/\s+/gu, " ").trim();
	if (compact.length <= maxChars) return compact;
	return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export function formatTurnStatusFooter(status: TurnStatus, maxLabelChars = 44): string {
	return `${emojiForTurnStatus(status.state)} ${trimToChars(status.label, maxLabelChars)} ✦`;
}

function extractJsonObject(text: string): string | undefined {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(text);
	const candidate = fenced?.[1] ?? text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return undefined;
	return candidate.slice(start, end + 1);
}

export function parseTurnStatusResponse(text: string): TurnStatus | undefined {
	const json = extractJsonObject(text);
	if (!json) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object") return undefined;
	const value = parsed as { state?: unknown; label?: unknown; detail?: unknown; actions?: unknown };
	if (value.state !== "done" && value.state !== "followup" && value.state !== "blocked") return undefined;
	if (typeof value.label !== "string" || !value.label.trim()) return undefined;
	const actions = Array.isArray(value.actions)
		? value.actions
				.filter((action): action is string => typeof action === "string" && Boolean(action.trim()))
				.slice(0, 3)
		: undefined;
	return {
		state: value.state,
		label: trimToChars(value.label, 80),
		detail: typeof value.detail === "string" && value.detail.trim() ? trimToChars(value.detail, 200) : undefined,
		actions,
	};
}

export function extractTextContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const typed = part as { type?: string; text?: string };
			return typed.type === "text" && typeof typed.text === "string" ? typed.text : "";
		})
		.filter(Boolean)
		.join("\n");
}

function branchMessage(entry: unknown): { role: string; text: string } | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	const typed = entry as { type?: string; customType?: string; message?: { role?: string; content?: unknown } };
	if (typed.type === "custom" || typed.customType) return undefined;
	if (typed.type !== "message") return undefined;
	const message = typed.message;
	if (!message) return undefined;
	const role = message.role;
	if (role !== "user" && role !== "assistant") return undefined;
	const text = extractTextContent(message.content).trim();
	if (!text) return undefined;
	return { role, text };
}

export function recentConversationForTurnStatus(
	entries: Iterable<unknown>,
	options: { maxMessages?: number; maxMessageChars?: number; maxTotalChars?: number } = {},
): string {
	const maxMessages = options.maxMessages ?? 10;
	const maxMessageChars = options.maxMessageChars ?? 1500;
	const maxTotalChars = options.maxTotalChars ?? 12_000;
	const messages = Array.from(entries).flatMap((entry) => {
		const message = branchMessage(entry);
		return message ? [message] : [];
	});
	const selected: string[] = [];
	let total = 0;
	for (const message of messages.slice(-maxMessages).reverse()) {
		const line = `${message.role}: ${trimToChars(message.text, maxMessageChars)}`;
		if (total + line.length > maxTotalChars && selected.length > 0) break;
		selected.unshift(trimToChars(line, maxTotalChars));
		total += line.length;
	}
	return selected.join("\n\n");
}
