import {
	type Component,
	decodeKittyPrintable,
	Key,
	matchesKey,
	type OverlayAnchor,
	type OverlayMargin,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

interface ThemeLike {
	fg(
		color: "accent" | "border" | "borderMuted" | "success" | "error" | "warning" | "muted" | "dim" | "text",
		text: string,
	): string;
	bold(text: string): string;
}

export interface OverlaySection {
	title?: string;
	body: string;
	accent?: "accent" | "success" | "warning" | "error" | "muted";
}

export type BubbleTail = "none" | "bottom-left" | "bottom-right";

export interface SpriteBubblePlacement {
	anchor: OverlayAnchor;
	tail: BubbleTail;
	margin: OverlayMargin;
}

export interface SpeechBubbleOptions {
	tail?: BubbleTail;
	scroll?: number;
	maxBodyLines?: number;
	maxWidth?: number;
	minWidth?: number;
	footerRows?: string[];
}

export interface ReplyableSpeechBubbleOptions extends SpeechBubbleOptions {
	requestRender?: () => void;
	onSubmit: (text: string) => Promise<OverlaySection[]>;
}

interface RenderedSpeechBubble {
	lines: string[];
	maxScroll: number;
	bodyLineCount: number;
}

function pad(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

function contentRow(line: string, contentWidth: number, theme: ThemeLike): string {
	return `${theme.fg("borderMuted", "│")} ${pad(truncateToWidth(line, contentWidth), contentWidth)} ${theme.fg("borderMuted", "│")}`;
}

function dimensions(width: number, options: SpeechBubbleOptions = {}): { totalWidth: number; contentWidth: number } {
	const minWidth = options.minWidth ?? 36;
	const maxWidth = options.maxWidth ?? 92;
	const totalWidth = Math.max(minWidth, Math.min(maxWidth, width - 4));
	return { totalWidth, contentWidth: totalWidth - 4 };
}

function topBorder(title: string, totalWidth: number, theme: ThemeLike): string {
	const titleText = ` ${title} `;
	const insideWidth = totalWidth - 2;
	const titleWidth = visibleWidth(titleText);
	return `${theme.fg("border", "╭─")}${theme.fg("accent", theme.bold(titleText))}${theme.fg("border", "─".repeat(Math.max(0, insideWidth - titleWidth - 1)))}${theme.fg("border", "╮")}`;
}

function bottomBorder(totalWidth: number, tail: BubbleTail, theme: ThemeLike): string[] {
	const insideWidth = totalWidth - 2;
	if (tail === "bottom-right") {
		return [
			`${theme.fg("border", "╰")}${theme.fg("border", "─".repeat(Math.max(0, insideWidth - 2)))}${theme.fg("border", "╰─╮")}`,
		];
	}
	if (tail === "bottom-left") {
		return [
			`${theme.fg("border", "╭─╯")}${theme.fg("border", "─".repeat(Math.max(0, insideWidth - 2)))}${theme.fg("border", "╯")}`,
		];
	}
	return [`${theme.fg("border", "╰")}${theme.fg("border", "─".repeat(insideWidth))}${theme.fg("border", "╯")}`];
}

function sectionRows(sections: OverlaySection[], contentWidth: number, theme: ThemeLike): string[] {
	const rows: string[] = [];
	for (const [index, section] of sections.entries()) {
		if (index > 0) rows.push(contentRow("", contentWidth, theme));
		if (section.title)
			rows.push(contentRow(theme.fg(section.accent ?? "accent", theme.bold(section.title)), contentWidth, theme));
		const wrapped = wrapTextWithAnsi(section.body.trim() || "—", contentWidth);
		for (const line of wrapped) rows.push(contentRow(line, contentWidth, theme));
	}
	return rows;
}

function scrollHint(hints: string, scroll: number, visibleLines: number, bodyLineCount: number): string {
	if (bodyLineCount <= visibleLines) return hints;
	const start = Math.min(bodyLineCount, scroll + 1);
	const end = Math.min(bodyLineCount, scroll + visibleLines);
	return `↑/↓ scroll ${start}-${end}/${bodyLineCount} · ${hints}`;
}

export function renderOverlay(
	title: string,
	sections: OverlaySection[],
	hints: string,
	width: number,
	theme: ThemeLike,
): string[] {
	return renderSpeechBubble(title, sections, hints, width, theme, { tail: "none" }).lines;
}

export function renderSpeechBubble(
	title: string,
	sections: OverlaySection[],
	hints: string,
	width: number,
	theme: ThemeLike,
	options: SpeechBubbleOptions = {},
): RenderedSpeechBubble {
	const { totalWidth, contentWidth } = dimensions(width, options);
	const bodyRows = sectionRows(sections, contentWidth, theme);
	const maxBodyLines = options.maxBodyLines ?? bodyRows.length;
	const maxScroll = Math.max(0, bodyRows.length - maxBodyLines);
	const scroll = Math.max(0, Math.min(options.scroll ?? 0, maxScroll));
	const visibleBodyRows = bodyRows.slice(scroll, scroll + maxBodyLines);
	const lines = [topBorder(title, totalWidth, theme), ...visibleBodyRows];
	for (const row of options.footerRows ?? []) lines.push(contentRow(row, contentWidth, theme));
	lines.push(
		contentRow(theme.fg("dim", scrollHint(hints, scroll, maxBodyLines, bodyRows.length)), contentWidth, theme),
	);
	lines.push(...bottomBorder(totalWidth, options.tail ?? "none", theme));
	return { lines, maxScroll, bodyLineCount: bodyRows.length };
}

export function createScrollableSpeechBubble(
	title: string,
	sections: OverlaySection[],
	hints: string,
	theme: ThemeLike,
	done: (result: undefined) => void,
	options: SpeechBubbleOptions = {},
): Component {
	let scroll = 0;
	let maxScroll = 0;
	const pageSize = () => Math.max(1, (options.maxBodyLines ?? 12) - 2);
	const clamp = () => {
		scroll = Math.max(0, Math.min(scroll, maxScroll));
	};
	return {
		render: (width: number) => {
			const rendered = renderSpeechBubble(title, sections, hints, width, theme, { ...options, scroll });
			maxScroll = rendered.maxScroll;
			clamp();
			return rendered.lines;
		},
		invalidate: () => {},
		handleInput: (data: string) => {
			if (matchesKey(data, "enter") || matchesKey(data, "return") || matchesKey(data, "escape")) {
				done(undefined);
				return;
			}
			if (matchesKey(data, "up") || matchesKey(data, "k")) scroll--;
			else if (matchesKey(data, "down") || matchesKey(data, "j")) scroll++;
			else if (matchesKey(data, "pageUp") || matchesKey(data, "u")) scroll -= pageSize();
			else if (matchesKey(data, "pageDown") || matchesKey(data, "d") || matchesKey(data, "space")) scroll += pageSize();
			else if (matchesKey(data, "g")) scroll = 0;
			else if (matchesKey(data, Key.shift("g"))) scroll = maxScroll;
			clamp();
		},
	};
}

function inputBoxRows(draft: string, busy: boolean, contentWidth: number, theme: ThemeLike): string[] {
	const label = busy ? " Thinking " : " Reply ";
	const topPrefix = `╭─${label}`;
	const top = `${topPrefix}${"─".repeat(Math.max(0, contentWidth - visibleWidth(topPrefix) - 1))}╮`;
	const value = busy
		? theme.fg("muted", "Thinking…")
		: draft
			? theme.fg("text", draft)
			: theme.fg("dim", "Type a follow-up…");
	const inputWidth = Math.max(1, contentWidth - 4);
	const input = `│ ${pad(truncateToWidth(`${value}${busy ? "" : "▌"}`, inputWidth), inputWidth)} │`;
	const bottom = `╰${"─".repeat(Math.max(0, contentWidth - 2))}╯`;
	return [theme.fg("borderMuted", top), input, theme.fg("borderMuted", bottom)];
}

function printableInput(data: string): string {
	const decoded = decodeKittyPrintable(data);
	if (decoded !== undefined) return decoded;
	const pasteText =
		data.includes("\u001b[200~") || data.includes("\u001b[201~")
			? data.replaceAll("\u001b[200~", "").replaceAll("\u001b[201~", "")
			: data;
	if (pasteText.includes("\u001b")) return "";
	return Array.from(pasteText)
		.filter((char) => {
			const code = char.codePointAt(0) ?? 0;
			return code >= 32 && code !== 127 && !(code >= 0x80 && code <= 0x9f);
		})
		.join("");
}

export function createReplyableSpeechBubble(
	title: string,
	initialSections: OverlaySection[],
	theme: ThemeLike,
	done: (result: undefined) => void,
	options: ReplyableSpeechBubbleOptions,
): Component {
	let sections = initialSections;
	let draft = "";
	let scroll = 0;
	let maxScroll = 0;
	let busy = false;
	let error: string | undefined;
	let scrollToBottom = true;
	const pageSize = () => Math.max(1, (options.maxBodyLines ?? 12) - 2);
	const clamp = () => {
		scroll = Math.max(0, Math.min(scroll, maxScroll));
	};
	const refresh = () => {
		options.requestRender?.();
	};
	const submit = async () => {
		const text = draft.trim();
		if (!text || busy) return;
		draft = "";
		busy = true;
		error = undefined;
		scrollToBottom = true;
		refresh();
		try {
			sections = await options.onSubmit(text);
		} catch (err) {
			error = err instanceof Error ? err.message : "Reply failed.";
		} finally {
			busy = false;
			scrollToBottom = true;
			refresh();
		}
	};
	return {
		render: (width: number) => {
			const displaySections = [...sections];
			if (busy)
				displaySections.push({ title: title.replace(/ side thread$/u, ""), body: "Thinking…", accent: "muted" });
			if (error) displaySections.push({ title: "Reply failed", body: error, accent: "error" });
			const { contentWidth } = dimensions(width, options);
			const footerRows = inputBoxRows(draft, busy, contentWidth, theme);
			const hint = busy ? "esc close · ↑/↓ scroll" : "↵ send · esc close · ↑/↓ scroll · ctrl-u clear";
			const rendered = renderSpeechBubble(title, displaySections, hint, width, theme, {
				...options,
				scroll,
				footerRows,
			});
			maxScroll = rendered.maxScroll;
			if (scrollToBottom) {
				scroll = maxScroll;
				scrollToBottom = false;
			} else {
				clamp();
			}
			return renderSpeechBubble(title, displaySections, hint, width, theme, { ...options, scroll, footerRows }).lines;
		},
		invalidate: () => {},
		handleInput: (data: string) => {
			if (matchesKey(data, "escape")) {
				done(undefined);
				return;
			}
			if (matchesKey(data, "enter") || matchesKey(data, "return")) {
				void submit();
				return;
			}
			if (matchesKey(data, Key.ctrl("u"))) {
				draft = "";
				refresh();
				return;
			}
			if (matchesKey(data, "backspace") || matchesKey(data, Key.backspace)) {
				draft = draft.slice(0, -1);
				refresh();
				return;
			}
			if (matchesKey(data, "up")) scroll--;
			else if (matchesKey(data, "down")) scroll++;
			else if (matchesKey(data, "pageUp")) scroll -= pageSize();
			else if (matchesKey(data, "pageDown")) scroll += pageSize();
			else {
				const text = printableInput(data);
				if (!text || busy) return;
				draft = `${draft}${text}`.slice(0, 500);
			}
			clamp();
			refresh();
		},
	};
}
