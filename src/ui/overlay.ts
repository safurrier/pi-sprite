import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

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

function pad(line: string, width: number): string {
	return `${line}${" ".repeat(Math.max(0, width - visibleWidth(line)))}`;
}

function bordered(line: string, width: number, theme: ThemeLike): string {
	return `${theme.fg("borderMuted", "│")} ${pad(truncateToWidth(line, width - 4), width - 4)} ${theme.fg("borderMuted", "│")}`;
}

export function renderOverlay(
	title: string,
	sections: OverlaySection[],
	hints: string,
	width: number,
	theme: ThemeLike,
): string[] {
	const innerWidth = Math.max(36, Math.min(92, width - 4));
	const titleText = ` ${title} `;
	const titleWidth = visibleWidth(titleText);
	const top = `${theme.fg("border", "╭─")}${theme.fg("accent", theme.bold(titleText))}${theme.fg("border", "─".repeat(Math.max(0, innerWidth - titleWidth)))}${theme.fg("border", "─╮")}`;
	const bottom = `${theme.fg("border", "╰")}${theme.fg("border", "─".repeat(innerWidth + 2))}${theme.fg("border", "╯")}`;
	const lines = [top];
	for (const [index, section] of sections.entries()) {
		if (index > 0) lines.push(bordered("", innerWidth + 4, theme));
		if (section.title)
			lines.push(bordered(theme.fg(section.accent ?? "accent", theme.bold(section.title)), innerWidth + 4, theme));
		const wrapped = wrapTextWithAnsi(section.body.trim() || "—", innerWidth);
		for (const line of wrapped) lines.push(bordered(line, innerWidth + 4, theme));
	}
	lines.push(bordered(theme.fg("dim", hints), innerWidth + 4, theme));
	lines.push(bottom);
	return lines;
}
