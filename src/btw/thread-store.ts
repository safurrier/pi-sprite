import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { BTW_ENTRY, BTW_RESET, customTypeOf } from "../agent/session-entries.ts";
import type { BtwEntry } from "./format.ts";

function isCustom(entry: unknown, type: string): entry is { type: "custom"; customType: string; data?: unknown } {
	return Boolean(
		entry &&
			typeof entry === "object" &&
			(entry as { type?: string }).type === "custom" &&
			customTypeOf(entry) === type,
	);
}

function isBtwEntryData(data: unknown): data is BtwEntry {
	if (!data || typeof data !== "object") return false;
	const typed = data as Partial<BtwEntry>;
	return Boolean(typed.question && typed.answer && typed.timestamp);
}

export function restoreBtwThreadFromBranch(branch: Iterable<unknown>): BtwEntry[] {
	const entries = Array.from(branch);
	let resetIndex = -1;
	for (let i = 0; i < entries.length; i++) if (isCustom(entries[i], BTW_RESET)) resetIndex = i;
	const restored: BtwEntry[] = [];
	for (const entry of entries.slice(resetIndex + 1)) {
		if (isCustom(entry, BTW_ENTRY) && isBtwEntryData(entry.data)) restored.push(entry.data);
	}
	return restored;
}

export function appendBtwEntry(pi: ExtensionAPI, entry: BtwEntry): void {
	pi.appendEntry(BTW_ENTRY, entry);
}

export function appendBtwReset(pi: ExtensionAPI): void {
	pi.appendEntry(BTW_RESET, { timestamp: Date.now() });
}
