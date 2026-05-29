/**
 * Runtime state, cross-session persistence, and bond tiers.
 *
 * `state` is a shared singleton mutated by index.ts. Persistence writes small
 * files under ~/.pi/agent/ (pokepet-state.json + pokepet-events.jsonl).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Intent } from "./content.ts";
import type { Mon, Mood } from "./mons.ts";

const DIR = join(homedir(), ".pi", "agent");
const STATE_FILE = join(DIR, "pokepet-state.json");
const EVENT_FILE = join(DIR, "pokepet-events.jsonl");

export interface PokeState {
	monKey: string;
	nick: string;
	mood: Mood;
	frameIdx: number;
	message: string;
	visible: boolean;
	lastActivity: number;
	lastIntent?: Intent;
	sessions: number;
	firstMet: string;
	energy: number;
	failStreak: number;
	editTimes: number[];
}

export const state: PokeState = {
	monKey: "pikachu",
	nick: "",
	mood: "hatch",
	frameIdx: 0,
	message: "",
	visible: true,
	lastActivity: Date.now(),
	sessions: 0,
	firstMet: new Date().toISOString(),
	energy: 85,
	failStreak: 0,
	editTimes: [],
};

interface SavedState {
	monKey: string;
	nick: string;
	sessions: number;
	firstMet: string;
	lastSeen: string;
	energy: number;
}

export function loadSaved(): Partial<SavedState> {
	try {
		if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, "utf8"));
	} catch {
		/* ignore corrupt state */
	}
	return {};
}

export function saveState(): void {
	try {
		mkdirSync(DIR, { recursive: true });
		const data: SavedState = {
			monKey: state.monKey,
			nick: state.nick,
			sessions: state.sessions,
			firstMet: state.firstMet,
			lastSeen: new Date().toISOString(),
			energy: Math.round(state.energy),
		};
		writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
	} catch {
		/* best-effort */
	}
}

export function logEvent(type: string): void {
	try {
		mkdirSync(DIR, { recursive: true });
		appendFileSync(EVENT_FILE, `${JSON.stringify({ t: Date.now(), type })}\n`);
	} catch {
		/* best-effort */
	}
}

export function readEvents(): { t: number; type: string }[] {
	try {
		if (!existsSync(EVENT_FILE)) return [];
		return readFileSync(EVENT_FILE, "utf8").trim().split("\n").slice(-2000).map((l) => JSON.parse(l));
	} catch {
		return [];
	}
}

export type Tier = "stranger" | "buddy" | "partner" | "bestie";

export function tierOf(sessions: number): Tier {
	if (sessions >= 50) return "bestie";
	if (sessions >= 15) return "partner";
	if (sessions >= 3) return "buddy";
	return "stranger";
}

export function greeting(tier: Tier, sessions: number, mon: Mon): string {
	switch (tier) {
		case "bestie":
			return `BESTIE! you're back! #${sessions}`;
		case "partner":
			return "my favorite trainer is back!";
		case "buddy":
			return "hey, good to see you again!";
		default:
			return `a wild ${mon.name} appeared!`;
	}
}
