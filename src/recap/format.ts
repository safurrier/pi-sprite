import type { OverlaySection } from "../ui/overlay.ts";

export const SYSTEM_PROMPT = `Create a short executive summary of the recent coding-session work for a human returning to the session. Be concrete and concise. Output exactly these labels with compact values: TL;DR, Recent work, Current status, Next. Keep the total under 120 words. Do not use markdown tables. Avoid exhaustive file lists; mention files or commands only when they are essential to understanding status.`;

export function recapSections(recap: string): OverlaySection[] {
	const sections: OverlaySection[] = [];
	let current: OverlaySection | undefined;
	for (const rawLine of recap.split("\n")) {
		const line = rawLine.trim();
		const match = /^(TL;DR|Recent work|Current status|Next|Goal|State|Decisions|Files\/commands):\s*(.*)$/iu.exec(line);
		if (match) {
			current = {
				title: match[1],
				body: match[2] || "—",
				accent: ["current status", "next"].includes(match[1].toLowerCase()) ? "success" : "accent",
			};
			sections.push(current);
		} else if (line && current) {
			current.body += `\n${line}`;
		} else if (line) {
			sections.push({ body: line });
		}
	}
	return sections.length ? sections : [{ body: recap }];
}
