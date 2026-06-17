import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface Category {
	label: string;
	tokens: number;
	glyph: string;
}
interface UsageModel {
	modelLabel: string;
	total: number;
	window: number;
	percent: number;
	categories: Category[];
}

const TOKENS_PER_CHAR = 4;
const estimate = (text: string) => Math.ceil(text.length / TOKENS_PER_CHAR);

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
	return String(n);
}

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const p = part as { type?: string; text?: string; thinking?: string; arguments?: unknown };
			if (p.type === "text") return p.text ?? "";
			if (p.type === "thinking") return p.thinking ?? "";
			if (p.type === "toolCall") return JSON.stringify(p.arguments ?? {});
			return "";
		})
		.join("\n");
}

function buildUsage(ctx: ExtensionCommandContext, pi: ExtensionAPI): UsageModel | null {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	if (!usage || !contextWindow || usage.percent === null || usage.tokens === null) return null;

	let messageTokens = 0;
	let toolTokens = 0;
	let customTokens = 0;
	let compactionTokens = 0;
	for (const entry of ctx.sessionManager.getBranch() as Iterable<any>) {
		if (entry.type === "message") {
			const role = entry.message?.role;
			const tokens = estimate(textFromContent(entry.message?.content));
			if (role === "toolResult" || role === "bashExecution") toolTokens += tokens;
			else messageTokens += tokens;
		} else if (entry.type === "custom" || entry.type === "custom_message") {
			customTokens += estimate(JSON.stringify(entry.data ?? entry.message ?? entry));
		} else if (entry.type === "compaction" || entry.type === "branch_summary") {
			compactionTokens += estimate(entry.summary ?? "");
		}
	}

	const systemPromptTokens = estimate(ctx.getSystemPrompt?.() ?? "");
	const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
	const allTools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
	const activeToolDefs = allTools.filter((tool: { name?: string }) => activeTools.includes(tool.name ?? ""));
	const systemToolTokens = estimate(JSON.stringify(activeToolDefs));
	const accounted =
		systemPromptTokens + systemToolTokens + messageTokens + toolTokens + customTokens + compactionTokens;
	const other = Math.max(0, usage.tokens - accounted);
	const free = Math.max(0, contextWindow - usage.tokens);
	const categories: Category[] = [
		{ label: "System prompt", tokens: systemPromptTokens, glyph: "◉" },
		{ label: "System tools", tokens: systemToolTokens, glyph: "◉" },
		{ label: "Messages", tokens: messageTokens, glyph: "◉" },
		{ label: "Tool results", tokens: toolTokens, glyph: "◉" },
		{ label: "Custom entries", tokens: customTokens, glyph: "◉" },
		{ label: "Compaction", tokens: compactionTokens, glyph: "◉" },
	];
	if (other > 0) categories.push({ label: "Other", tokens: other, glyph: "◉" });
	categories.push({ label: "Free space", tokens: free, glyph: "□" });
	return {
		modelLabel: ctx.model
			? `${ctx.model.name ?? ctx.model.id} (${formatTokens(contextWindow)} context)`
			: `${formatTokens(contextWindow)} context`,
		total: usage.tokens,
		window: contextWindow,
		percent: usage.percent,
		categories,
	};
}

function renderGrid(model: UsageModel, width: number): string[] {
	const cols = Math.max(10, Math.min(24, Math.floor(width / 4)));
	const rows = 9;
	const totalCells = cols * rows;
	const usedCells = Math.max(0, Math.min(totalCells, Math.round((model.total / model.window) * totalCells)));
	const cells = Array.from({ length: totalCells }, (_, i) => (i < usedCells ? "▣" : "▢"));
	const lines: string[] = [];
	for (let row = 0; row < rows; row++) lines.push(cells.slice(row * cols, (row + 1) * cols).join(" "));
	return lines;
}

class ContextOverlay {
	constructor(
		private readonly model: UsageModel,
		private readonly expanded: boolean,
		private readonly done: () => void,
	) {}
	invalidate() {}
	handleInput(data: string) {
		if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "enter")) this.done();
	}
	render(width: number): string[] {
		const inner = Math.max(40, width - 4);
		const leftWidth = Math.min(56, Math.floor(inner * 0.52));
		const grid = renderGrid(this.model, leftWidth);
		const pct = `${this.model.percent.toFixed(1)}%`;
		const right = [
			this.model.modelLabel,
			`${formatTokens(this.model.total)}/${formatTokens(this.model.window)} tokens (${pct})`,
			"",
			"Estimated usage by category",
			...this.model.categories.map(
				(c) =>
					`${c.glyph} ${c.label}: ${formatTokens(c.tokens)} tokens (${((c.tokens / this.model.window) * 100).toFixed(1)}%)`,
			),
		];
		if (this.expanded) {
			right.push(
				"",
				"MCP tools · /mcp",
				"└ loaded on demand",
				"",
				"Custom agents · /agents",
				"└ counted when visible in context",
				"",
				"Skills · /skills",
				"└ included in system prompt estimate",
			);
		} else {
			right.push("", "/context all to expand");
		}
		const out = ["/context", "└ Context Usage"];
		const maxRows = Math.max(grid.length, right.length);
		for (let i = 0; i < maxRows; i++) {
			const left = grid[i] ?? "";
			const spacer = " ".repeat(Math.max(2, leftWidth - visibleWidth(left)));
			out.push(truncateToWidth(`${left}${spacer}${right[i] ?? ""}`, width));
		}
		out.push("", "Esc/q/Enter to close");
		return out.map((line) => truncateToWidth(line, width));
	}
}

export function registerContextCommand(pi: ExtensionAPI) {
	pi.registerCommand("context", {
		description: "Show Claude-style context usage visualization",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			const model = buildUsage(ctx, pi);
			if (!model) return ctx.ui.notify("Context usage info is not available yet. Send a message first.", "warning");
			await ctx.ui.custom(
				(_tui, _theme, _kb, done) => new ContextOverlay(model, args.trim() === "all", () => done(undefined)),
				{
					overlay: true,
					overlayOptions: { anchor: "center", width: "88%", minWidth: 72, maxHeight: "90%" },
				},
			);
		},
	});
}
