import type { OverlaySection } from "../ui/overlay.ts";

export interface BtwEntry {
	question: string;
	answer: string;
	timestamp: number;
}

export function formatThread(entries: BtwEntry[]): string {
	return entries.map((e, i) => `## BTW ${i + 1}\nUser: ${e.question}\nAssistant: ${e.answer}`).join("\n\n");
}

export function formatThreadSections(entries: BtwEntry[], speakerName = "Sprite"): OverlaySection[] {
	if (!entries.length) {
		return [{ title: "Side thread · empty", body: "Use /btw <message> to start a side conversation." }];
	}
	const sections: OverlaySection[] = [
		{
			title: `Side thread · ${entries.length} turn${entries.length === 1 ? "" : "s"}`,
			body: "Use /btw <message> to continue, /btw:new to reset, or /btw:ask for a one-off aside.",
			accent: "muted",
		},
	];
	for (const [index, entry] of entries.entries()) {
		const latest = index === entries.length - 1;
		sections.push({ title: `You · ${index + 1}`, body: entry.question, accent: latest ? "accent" : "muted" });
		sections.push({ title: speakerName, body: entry.answer, accent: latest ? "success" : "accent" });
	}
	return sections;
}
