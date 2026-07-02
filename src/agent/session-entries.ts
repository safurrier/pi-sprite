import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const BTW_ENTRY = "pi-sprite:btw-entry";
export const BTW_RESET = "pi-sprite:btw-reset";
export const RECAP_ENTRY = "pi-sprite:recap";

const HIDDEN_CONTEXT_CUSTOM_TYPES = new Set([BTW_ENTRY, BTW_RESET, RECAP_ENTRY]);

export function customTypeOf(entry: unknown): string | undefined {
	if (!entry || typeof entry !== "object") return undefined;
	const typed = entry as { customType?: unknown };
	return typeof typed.customType === "string" ? typed.customType : undefined;
}

export function isPiSpriteHiddenContextEntry(entry: unknown): boolean {
	const customType = customTypeOf(entry);
	return Boolean(customType && HIDDEN_CONTEXT_CUSTOM_TYPES.has(customType));
}

export function filterPiSpriteHiddenContextEntries<T>(entries: T[]): T[] {
	return entries.filter((entry) => !isPiSpriteHiddenContextEntry(entry));
}

export function registerPiSpriteContextFilter(pi: ExtensionAPI): void {
	(
		pi as { on: (event: string, handler: (event: { messages: unknown[] }) => Promise<{ messages: unknown[] }>) => void }
	).on("context", async (event) => ({ messages: filterPiSpriteHiddenContextEntries(event.messages) }));
}
