import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface ThemeLike {
	fg(
		color:
			| "accent"
			| "border"
			| "borderAccent"
			| "borderMuted"
			| "success"
			| "error"
			| "warning"
			| "muted"
			| "dim"
			| "text",
		text: string,
	): string;
	bg(color: "customMessageBg" | "selectedBg" | "toolPendingBg", text: string): string;
	bold(text: string): string;
}

interface Category {
	label: string;
	tokens: number;
	glyph: string;
	color: "accent" | "muted" | "dim" | "warning" | "success" | "borderAccent" | "text";
	detail?: string;
}
interface UsageModel {
	modelLabel: string;
	total: number;
	window: number;
	percent: number;
	categories: Category[];
	actualTokens: number;
	estimatedTokens: number;
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

export function splitSystemPromptForContextUsage(prompt: string): { systemPrompt: string; skills: string } {
	const skillBlocks = prompt.match(/<available_skills>[\s\S]*?<\/available_skills>/giu) ?? [];
	const skills = skillBlocks.join("\n\n");
	const systemPrompt = prompt.replace(/<available_skills>[\s\S]*?<\/available_skills>/giu, "").trim();
	return { systemPrompt, skills };
}

function activeContextEntries(branchEntries: any[]): any[] {
	let compactionIndex = -1;
	for (let i = branchEntries.length - 1; i >= 0; i--) {
		if (branchEntries[i]?.type === "compaction") {
			compactionIndex = i;
			break;
		}
	}
	if (compactionIndex < 0) return branchEntries;

	const compaction = branchEntries[compactionIndex];
	const activeEntries: any[] = [compaction];
	let foundFirstKept = !compaction.firstKeptEntryId;
	for (let i = 0; i < compactionIndex; i++) {
		const entry = branchEntries[i];
		if (entry.id === compaction.firstKeptEntryId) foundFirstKept = true;
		if (foundFirstKept) activeEntries.push(entry);
	}
	activeEntries.push(...branchEntries.slice(compactionIndex + 1));
	return activeEntries;
}

export function buildUsage(ctx: ExtensionCommandContext, pi: ExtensionAPI): UsageModel | null {
	const usage = ctx.getContextUsage();
	const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
	if (!usage || !contextWindow || usage.percent === null || usage.tokens === null) return null;

	let messageTokens = 0;
	let toolTokens = 0;
	let customTokens = 0;
	let compactionTokens = 0;
	for (const entry of activeContextEntries(Array.from(ctx.sessionManager.getBranch() as Iterable<any>))) {
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

	const splitPrompt = splitSystemPromptForContextUsage(ctx.getSystemPrompt?.() ?? "");
	const systemPromptTokens = estimate(splitPrompt.systemPrompt);
	const skillTokens = estimate(splitPrompt.skills);
	const activeTools = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
	const allTools = typeof pi.getAllTools === "function" ? pi.getAllTools() : [];
	const activeToolDefs = allTools.filter((tool: { name?: string }) => activeTools.includes(tool.name ?? ""));
	const systemToolTokens = estimate(JSON.stringify(activeToolDefs));
	const accounted =
		systemPromptTokens + skillTokens + systemToolTokens + messageTokens + toolTokens + customTokens + compactionTokens;
	const total = usage.tokens;
	const other = Math.max(0, usage.tokens - accounted);
	const free = Math.max(0, contextWindow - usage.tokens);
	const categories: Category[] = [
		{
			label: "System message",
			tokens: systemPromptTokens,
			glyph: "◉",
			color: "muted",
			detail: "Base instructions, project context, and runtime guidance.",
		},
		{
			label: "Skills",
			tokens: skillTokens,
			glyph: "◉",
			color: "warning",
			detail: "Available skill metadata injected separately from the system message.",
		},
		{
			label: "System tools",
			tokens: systemToolTokens,
			glyph: "◉",
			color: "borderAccent",
			detail: "Active tool schemas; MCP tools are usually loaded on demand via /mcp.",
		},
		{ label: "Messages", tokens: messageTokens, glyph: "◉", color: "accent" },
		{ label: "Tool results", tokens: toolTokens, glyph: "◉", color: "success" },
		{
			label: "Custom entries",
			tokens: customTokens,
			glyph: "◉",
			color: "text",
			detail: "Extension entries, overlays, and other non-message session records.",
		},
		{ label: "Compaction", tokens: compactionTokens, glyph: "◉", color: "muted" },
	];
	if (other > 0) categories.push({ label: "Other", tokens: other, glyph: "◉", color: "muted" });
	categories.push({ label: "Free space", tokens: free, glyph: "□", color: "dim" });
	return {
		modelLabel: ctx.model
			? `${ctx.model.name ?? ctx.model.id} (${formatTokens(contextWindow)} context)`
			: `${formatTokens(contextWindow)} context`,
		total,
		window: contextWindow,
		percent: Math.min(100, (total / contextWindow) * 100),
		categories,
		actualTokens: usage.tokens,
		estimatedTokens: accounted,
	};
}

function pad(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

function cellColor(category: Category, theme: ThemeLike): (text: string) => string {
	return (text: string) => theme.fg(category.color, text);
}

function renderGrid(model: UsageModel, width: number, theme: ThemeLike): string[] {
	const cols = Math.max(12, Math.min(28, Math.floor(width / 2.2)));
	const rows = 8;
	const totalCells = cols * rows;
	const usedCategories = model.categories.filter((category) => category.label !== "Free space" && category.tokens > 0);
	const cells: string[] = [];
	for (const category of usedCategories) {
		const cellCount = Math.max(1, Math.round((category.tokens / model.window) * totalCells));
		for (let i = 0; i < cellCount && cells.length < totalCells; i++) cells.push(cellColor(category, theme)("◉"));
	}
	while (cells.length < totalCells) cells.push(theme.fg("dim", "□"));
	const lines: string[] = [];
	for (let row = 0; row < rows; row++) lines.push(cells.slice(row * cols, (row + 1) * cols).join(" "));
	return lines;
}

function bar(percent: number, width: number, theme: ThemeLike): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return `${theme.fg("accent", "█".repeat(filled))}${theme.fg("dim", "░".repeat(Math.max(0, width - filled)))}`;
}

function row(left: string, right: string, width: number, gap = 2): string {
	const rightWidth = visibleWidth(right);
	const leftWidth = Math.max(0, width - rightWidth - gap);
	return `${pad(truncateToWidth(left, leftWidth), leftWidth)}${" ".repeat(gap)}${truncateToWidth(right, rightWidth)}`;
}

function categoryLine(category: Category, model: UsageModel, width: number, theme: ThemeLike): string {
	const pct = model.window ? (category.tokens / model.window) * 100 : 0;
	const left = `${theme.fg(category.color, category.glyph)} ${theme.fg(category.color, category.label)}`;
	const right = `${formatTokens(category.tokens)} (${pct.toFixed(1)}%)`;
	return row(left, theme.fg(category.label === "Free space" ? "dim" : "muted", right), width);
}

function box(title: string, body: string[], width: number, theme: ThemeLike): string[] {
	const inner = Math.max(12, width - 2);
	const label = ` ${title} `;
	const top = `${theme.fg("border", "╭─")}${theme.fg("accent", theme.bold(label))}${theme.fg("border", "─".repeat(Math.max(0, inner - visibleWidth(label) - 1)))}${theme.fg("border", "╮")}`;
	const bottom = `${theme.fg("border", "╰")}${theme.fg("border", "─".repeat(inner))}${theme.fg("border", "╯")}`;
	return [
		top,
		...body.map(
			(line) =>
				`${theme.fg("borderMuted", "│")} ${pad(truncateToWidth(line, inner - 2), inner - 2)} ${theme.fg("borderMuted", "│")}`,
		),
		bottom,
	];
}

function combineColumns(left: string[], right: string[], leftWidth: number, rightWidth: number): string[] {
	const lines: string[] = [];
	const count = Math.max(left.length, right.length);
	for (let i = 0; i < count; i++) {
		lines.push(`${pad(left[i] ?? "", leftWidth)}  ${pad(right[i] ?? "", rightWidth)}`);
	}
	return lines;
}

export function renderContextOverlayLines(
	model: UsageModel,
	expanded: boolean,
	width: number,
	theme: ThemeLike,
): string[] {
	const panelWidth = Math.max(1, width);
	const inner = panelWidth - 4;
	const title = ` /context `;
	const top = `${theme.fg("border", "╭─")}${theme.fg("accent", theme.bold(title))}${theme.fg("border", "─")}${theme.fg("text", " Context Usage ")}${theme.fg("border", "─".repeat(Math.max(0, panelWidth - visibleWidth("╭─") - visibleWidth(title) - visibleWidth("─ Context Usage ") - 1)))}${theme.fg("border", "╮")}`;
	const bottom = `${theme.fg("border", "╰")}${theme.fg("border", "─".repeat(Math.max(0, panelWidth - 2)))}${theme.fg("border", "╯")}`;
	const lines: string[] = [top];

	const summary = `${formatTokens(model.total)}/${formatTokens(model.window)} tokens (${model.percent.toFixed(1)}%)`;
	lines.push(
		`${theme.fg("borderMuted", "│")} ${pad(row(theme.fg("accent", model.modelLabel), theme.fg("muted", summary), inner), inner)} ${theme.fg("borderMuted", "│")}`,
	);
	lines.push(
		`${theme.fg("borderMuted", "│")} ${pad(bar(model.percent, Math.min(48, inner), theme), inner)} ${theme.fg("borderMuted", "│")}`,
	);
	lines.push(`${theme.fg("borderMuted", "│")} ${pad("", inner)} ${theme.fg("borderMuted", "│")}`);

	const wide = panelWidth >= 96;
	const categoryWidth = wide ? Math.min(46, Math.floor((inner - 2) * 0.42)) : inner;
	const mapWidth = wide ? inner - categoryWidth - 2 : inner;
	const mapBox = box("Usage map", renderGrid(model, mapWidth - 4, theme), mapWidth, theme);
	const categoryRows = [...model.categories.map((category) => categoryLine(category, model, categoryWidth - 4, theme))];
	const categoryBox = box("Estimated usage", categoryRows, categoryWidth, theme);
	const bodyRows = wide
		? combineColumns(mapBox, categoryBox, mapWidth, categoryWidth)
		: [...mapBox, "", ...categoryBox];
	for (const bodyRow of bodyRows) {
		lines.push(
			`${theme.fg("borderMuted", "│")} ${pad(truncateToWidth(bodyRow, inner), inner)} ${theme.fg("borderMuted", "│")}`,
		);
	}

	if (expanded) {
		lines.push(`${theme.fg("borderMuted", "│")} ${pad("", inner)} ${theme.fg("borderMuted", "│")}`);
		const details = [
			...model.categories
				.filter((category) => category.detail)
				.map(
					(category) =>
						`${theme.fg(category.color, category.label)} ${theme.fg("dim", "—")} ${theme.fg("muted", category.detail ?? "")}`,
				),
			`${theme.fg("borderAccent", "MCP tools")} ${theme.fg("dim", "—")} ${theme.fg("muted", "/mcp, loaded on demand")}`,
			`${theme.fg("accent", "Custom agents")} ${theme.fg("dim", "—")} ${theme.fg("muted", "/agents, counted when visible in context")}`,
			`${theme.fg("warning", "Skills")} ${theme.fg("dim", "—")} ${theme.fg("muted", "/skills, shown separately from the system message when detected")}`,
		];
		for (const line of box("Breakdown notes", details, inner, theme)) {
			lines.push(
				`${theme.fg("borderMuted", "│")} ${pad(truncateToWidth(line, inner), inner)} ${theme.fg("borderMuted", "│")}`,
			);
		}
	} else {
		lines.push(`${theme.fg("borderMuted", "│")} ${pad("", inner)} ${theme.fg("borderMuted", "│")}`);
		lines.push(
			`${theme.fg("borderMuted", "│")} ${pad(theme.fg("dim", "/context all to expand · Esc/q/Enter to close"), inner)} ${theme.fg("borderMuted", "│")}`,
		);
	}
	lines.push(bottom);
	return lines.map((line) => theme.bg("customMessageBg", pad(truncateToWidth(line, panelWidth), panelWidth)));
}

class ContextOverlay {
	constructor(
		private readonly model: UsageModel,
		private readonly expanded: boolean,
		private readonly theme: ThemeLike,
		private readonly done: () => void,
	) {}
	invalidate() {}
	handleInput(data: string) {
		if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "enter")) this.done();
	}
	render(width: number): string[] {
		return renderContextOverlayLines(this.model, this.expanded, width, this.theme);
	}
}

export function registerContextCommand(pi: ExtensionAPI) {
	const handler = async (args: string, ctx: ExtensionCommandContext) => {
		const model = buildUsage(ctx, pi);
		if (!model) return ctx.ui.notify("Context usage info is not available yet. Send a message first.", "warning");
		await ctx.ui.custom(
			(_tui, theme, _kb, done) => new ContextOverlay(model, args.trim() === "all", theme, () => done(undefined)),
			{
				overlay: true,
				overlayOptions: { anchor: "center", width: "92%", minWidth: 78, maxHeight: "90%" },
			},
		);
	};
	pi.registerCommand("context", {
		description: "Show Claude-style context usage visualization",
		handler,
	});
	pi.registerCommand("sprite:context", {
		description: "Show pi-sprite context usage visualization",
		handler,
	});
}
