/**
 * Detailed "large" ASCII art for /pokemon large.
 *
 * The default footer pet is the compact 3-line sprite from mons.ts. This module
 * provides the bigger, more recognizable line-art versions shown when the user
 * switches to detailed mode. They animate through the *same* tick()->render()
 * loop and frameIdx, reusing the shared mood eyes / thought / accent vocabulary
 * from mons.ts so motion stays consistent with the small sprite.
 *
 * Cross-terminal notes (macOS / Windows / Linux):
 *   - Body art uses only box-drawing + ASCII (CP437-safe, renders in Windows
 *     Terminal, iTerm, Terminal.app, Warp, and common Linux terminals).
 *   - No wide emoji inside the body (they take 2 cells and tear alignment).
 *     The only emoji used are appended *accents* (z / coffee), identical to the
 *     small sprite, and the type tag lives on the label line, not the art.
 *   - Eye glyphs reuse EYES from mons.ts, so detailed mode carries the exact
 *     same terminal-compatibility surface the compact mode already ships.
 *   - Colour is applied per-line by the caller and honours NO_COLOR.
 *
 * Authoring contract for each sprite:
 *   - Exactly one literal `L` and one literal `R` mark the left/right eye slots.
 *     They are replaced 1:1 with a 1-column mood eye glyph, preserving width.
 *     Box-drawing art never otherwise contains the letters L or R.
 *   - `head` is the row index that receives sleep "z", the thinking bubble, and
 *     the guard coffee accent. `acc` is the row that receives happy/working
 *     accents. Accents are appended at end-of-line, so they never shift columns.
 */

import { EYES, type Mon, type Mood, THOUGHTS, WEAK_EYES } from "./mons.ts";

interface LargeSprite {
	/** Multi-line body art. Exactly one `L` and one `R` mark the eye slots. */
	art: string[];
	/** Row for sleep "z", thinking bubble, and guard coffee. */
	head: number;
	/** Row for happy / working accents. */
	acc: number;
}

const LARGE: Record<string, LargeSprite> = {
	// Long ears with dark tips, round cheeks, and the iconic zig-zag tail.
	pikachu: {
		head: 1,
		acc: 13,
		art: [
			"    ╲╲▁▁          ▁▁╱╱     ",
			"     ╲  ╲▁      ▁╱  ╱      ",
			"      ╲▆ ╲▁▁▁▁▁▁╱ ▆╱       ",
			"       ╲▁╱        ╲▁╱       ",
			"       ╱  ╭─╮  ╭─╮  ╲       ",
			"      ╱   │L│  │R│   ╲      ",
			"     │    ╰─╯  ╰─╯    │     ",
			"     │   ●     ╷    ● │     ",
			"     │      ╲▁▁▁╱     │     ",
			"      ╲▁▁          ▁▁╱      ",
			"      ╱  ▔▔▔▔▔▔▔▔  ╲▁▁▁     ",
			"     │              │   ╲╲  ",
			"     │              │  ▁▆╱  ",
			"      ╲▁╮        ╭▁╱▁▆▘ ╱   ",
			"       ╱│        │╲  ╲▁╱    ",
			"      ╯ ╰        ╯ ╰        ",
		],
	},
	// Rounded snout, small arms, soft belly, and a long tail topped with flame.
	charmander: {
		head: 0,
		acc: 11,
		art: [
			"       ╭───────╮              ",
			"      ╱         ╲       ▁▆▁   ",
			"     ╱  ╭─╮ ╭─╮  ╲    ▆╱  ╲▆  ",
			"    │   │L│ │R│   │  ▆ ╲  ▆╱  ",
			"    │   ╰─╯ ╰─╯   │   ╲▆╲▆╱   ",
			"    │     ╶┬╴     │    ╲  ╲   ",
			"     ╲   ╰───╯   ╱      ╲  │  ",
			"      ╲▁▁▁▁▁▁▁▁╱   ▁▁▁▁▁╲▁╱   ",
			"     ╱          ╲▁╱           ",
			"    │   ╭─────╮   │           ",
			"    │   │     │   │           ",
			"     ╲▁▁╯     ╰▁▁╱            ",
			"     ╱ ╲       ╱ ╲           ",
			"    ╯  ╰▁     ▁╯  ╰          ",
			"       ╯╰     ╯╰             ",
		],
	},
	// Big eyes, patterned hard shell, stubby limbs, and a curled tail.
	squirtle: {
		head: 1,
		acc: 11,
		art: [
			"        ▁▁▁▁▁▁▁▁            ",
			"      ╱          ╲          ",
			"     │   ╭─╮  ╭─╮  │        ",
			"     │   │L│  │R│  │        ",
			"     │   ╰─╯  ╰─╯  │        ",
			"      ╲     ╶─╴   ╱         ",
			"       ╲▁▁     ▁▁╱          ",
			"     ╭─────────────╮   ▁▁   ",
			"    ╱ ╲   ╱╲    ╱╲ ╱ ╲ ╱  ╲ ",
			"   │   ╲ ╱  ╲  ╱  ╳   │    ╲",
			"   │    ╳    ╳╳    ╲  │   ╱ ",
			"   │   ╱ ╲  ╱  ╲  ╱╲  │ ▁╱  ",
			"    ╲ ╱   ╲╱    ╲╱  ╲╱         ",
			"     ╰─────────────╯        ",
			"      ╱╲          ╱╲        ",
			"     ╯  ╰        ╯  ╰       ",
		],
	},
	// Squat body, pointed ears, and the signature plant bulb sprouting on its back.
	bulbasaur: {
		head: 0,
		acc: 12,
		art: [
			"        ╱▔╲      ╱▔╲         ",
			"       ╱   ╲    ╱   ╲        ",
			"      ╱     ╲  ╱     ╲       ",
			"     │       ╲╱       │      ",
			"      ╲▁▁▁▁▁▁▁▁▁▁▁▁▁▁╱       ",
			"      ╱   ╭─╮    ╭─╮   ╲      ",
			"     ╱    │L│    │R│    ╲     ",
			"    │     ╰─╯    ╰─╯     │    ",
			"    │        ╶┬╴        │    ",
			"     ╲     ◝▔▔▔▔▔◜     ╱     ",
			"      ╲▁▁            ▁▁╱      ",
			"      ╱  ╲▁▁▁▁▁▁▁▁▁▁╱  ╲      ",
			"     │                  │     ",
			"      ╲▁╮            ╭▁╱      ",
			"       ╱ ╲          ╱ ╲       ",
			"      ╯   ╰        ╯   ╰      ",
		],
	},
	// Fox-like: large ears, expressive eyes, and a big fluffy neck ruff + tail.
	eevee: {
		head: 2,
		acc: 12,
		art: [
			"     ╲▔╲          ╱▔╱      ",
			"      ╲ ╲▁      ▁╱ ╱       ",
			"       ╲  ╲▁▁▁▁╱  ╱        ",
			"        ╲▁      ▁╱         ",
			"        ╱  ╭─╮╭─╮ ╲        ",
			"       ╱   │L││R│  ╲       ",
			"      │    ╰─╯╰─╯   │      ",
			"      │      ╶╴     │      ",
			"       ╲▁▁  ╲▁╱  ▁▁╱       ",
			"      ╱╲╱╲╱╲╱╲╱╲╱╲╱╲       ",
			"     ╱  ╲╱╲╱╲╱╲╱╲╱  ╲      ",
			"    │                │▁▁   ",
			"     ╲▁            ▁╱   ╲╲  ",
			"       ╲▁▁      ▁▁╱  ▁▁╱╱   ",
			"      ╱ ╲ ╲▁▁▁▁╱ ╱ ╲╲▁╱     ",
			"     ╯  ╰      ╯  ╰         ",
		],
	},
	// Round balloon body, oversized eyes, a tuft of curled hair, and tiny limbs.
	jigglypuff: {
		head: 0,
		acc: 9,
		art: [
			"          ╭─╮             ",
			"      ▁▁▁▁╯ ╰╮            ",
			"    ╱╯        ╰▁▁▁╮       ",
			"   ╱              ╲       ",
			"  ╱   ╭────╮ ╭────╮ ╲     ",
			"  │   │ L  │ │  R │  │    ",
			"  │   ╰────╯ ╰────╯  │    ",
			"  │        ╶─╴       │    ",
			"  │       ╲▁▁▁╱      │    ",
			"   ╲                ╱     ",
			"    ╲▁              ▁╱     ",
			"      ╲▁▁▁▁▁▁▁▁▁▁▁▁╱      ",
		],
	},
	// Three hair sprigs, vacant round eyes, a flat bill, and hands held to its head.
	psyduck: {
		head: 0,
		acc: 11,
		art: [
			"         ╷  ╷  ╷           ",
			"         │  │  │           ",
			"        ╭┴──┴──┴╮          ",
			"       ╱         ╲         ",
			"      │  ╭─╮  ╭─╮ │        ",
			"      │  │L│  │R│ │        ",
			"      │  ╰─╯  ╰─╯ │        ",
			"       ╲   ▁▁▁   ╱         ",
			"        ╲▁╱   ╲▁╱          ",
			"       ╱         ╲         ",
			"     ▁╱   ╲   ╱   ╲▁       ",
			"    ╱ ╲    ╲ ╱    ╱ ╲      ",
			"    ╲▁╱     ╳     ╲▁╱      ",
			"      ╲▁▁▁▁▁▁▁▁▁▁▁╱        ",
			"       ╱╲        ╱╲        ",
			"      ╯  ╰      ╯  ╰       ",
		],
	},
};

/** Shift a line right by `n` columns to simulate horizontal motion. */
const lift = (s: string, n: number): string => (n > 0 ? " ".repeat(n) + s : s);

export interface LargeFrameOpts {
	/** Full-energy: unlock the wider, bouncier motion range. */
	lively?: boolean;
	/** Starving: droop the eyes and damp the motion. */
	weak?: boolean;
}

/** True when a Pokémon has detailed large art available. */
export function hasLargeArt(monKey: string): boolean {
	return monKey in LARGE;
}

/**
 * Build an animated large frame for a Pokémon in a given mood at `idx`.
 *
 * Mirrors buildFrame()'s animation language: mood eyes cycle (blink/expression),
 * the body sways/jitters per mood, and accents append per mood — all gated by
 * energy via `lively`/`weak`, so a starving pet barely moves and a full one
 * really dances. Falls back to Pikachu art for unknown keys.
 */
export function buildLargeFrame(
	monKey: string,
	_mon: Mon,
	mood: Mood,
	idx: number,
	opts: LargeFrameOpts = {},
): string[] {
	const sprite = LARGE[monKey] ?? LARGE.pikachu!;
	const lively = opts.lively ?? true;
	const weak = opts.weak ?? false;

	const pool = weak && (mood === "idle" || mood === "working" || mood === "thinking") ? WEAK_EYES : EYES[mood];
	const e = pool[idx % pool.length]!;
	const le = e[0] ?? "o";
	const re = e[2] ?? le;

	// Inject mood eyes (1:1, width-preserving) into the dedicated L/R slots.
	const lines = sprite.art.map((line) => line.replace("L", le).replace("R", re));

	const { head, acc } = sprite;
	let sway = 0;

	switch (mood) {
		case "sleep":
			if (lines[head] !== undefined) lines[head] += idx % 2 ? "  z" : " z";
			break;

		case "thinking":
			if (lines[head] !== undefined) lines[head] += THOUGHTS[idx % THOUGHTS.length]!;
			sway = [0, 1, 1, 0][idx % 4]!;
			break;

		case "working":
			if (lines[acc] !== undefined && idx % 2) lines[acc] += " *";
			sway = lively ? idx % 2 : 0;
			break;

		case "happy":
			if (lines[acc] !== undefined) lines[acc] += idx % 2 ? " ✦" : " !";
			sway = (lively ? [0, 1, 2, 1] : [0, 1, 0, 1])[idx % 4]!;
			break;

		case "panic":
			sway = [0, 2, 0, 1][idx % 4]!;
			break;

		case "guard":
			if (lines[head] !== undefined && idx % 4 === 0) lines[head] += "  ☕";
			sway = idx % 2;
			break;
	}

	return sway > 0 ? lines.map((l) => lift(l, sway)) : lines;
}
