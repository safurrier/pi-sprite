export interface LiveTurnStatus {
	label: string;
	detail?: string;
}

function trimToChars(text: string, maxChars: number): string {
	const compact = text.replace(/\s+/gu, " ").trim();
	if (compact.length <= maxChars) return compact;
	return `${compact.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function extractJsonObject(text: string): string | undefined {
	const fenced = /```(?:json)?\s*([\s\S]*?)```/iu.exec(text);
	const candidate = fenced?.[1] ?? text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start === -1 || end === -1 || end <= start) return undefined;
	return candidate.slice(start, end + 1);
}

function claimsFinalOutcome(label: string): boolean {
	return /\b(done|complete|completed|finished|fixed|verified|merged|ready|passed|passing)\b|\ball\s+done\b|\btests?\s+pass(?:ed|ing)?\b|\bpr\s+ready\b/iu.test(
		label,
	);
}

export function formatLiveStatusFooter(status: LiveTurnStatus, maxLabelChars = 38): string {
	return `🟣 ${trimToChars(status.label, maxLabelChars)}…`;
}

export function parseLiveStatusResponse(text: string): LiveTurnStatus | undefined {
	const json = extractJsonObject(text);
	if (!json) return undefined;
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch {
		return undefined;
	}
	if (!parsed || typeof parsed !== "object") return undefined;
	const value = parsed as { label?: unknown; detail?: unknown };
	if (typeof value.label !== "string" || !value.label.trim()) return undefined;
	if (claimsFinalOutcome(value.label)) return undefined;
	return {
		label: trimToChars(value.label, 72),
		detail: typeof value.detail === "string" && value.detail.trim() ? trimToChars(value.detail, 160) : undefined,
	};
}

export function promptForLiveStatus(recentConversation: string): string {
	return [
		"Summarize the current in-progress work of this Pi coding-agent turn for a compact sprite footer.",
		"This status is provisional and may be shown while the agent is still working.",
		"Do not claim the task is complete, merged, fixed, verified, or done.",
		"Do not add personality, encouragement, jokes, or autonomous commentary.",
		"Return JSON only with this shape:",
		'{"label":"2-6 word current activity","detail":"optional one sentence"}',
		"Guidelines:",
		"- label should describe current activity, not final outcome.",
		"- label should be concrete and footer-friendly, around 2-6 words.",
		"- Good labels: editing renderer, running tests, investigating tmux cleanup, writing docs.",
		"- Bad labels: all done, tests passed, PR ready, great progress.",
		"",
		"Recent conversation:",
		recentConversation || "(No recent conversation available.)",
	].join("\n");
}
