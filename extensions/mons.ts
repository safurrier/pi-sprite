/**
 * The Pokémon roster and frame builder.
 *
 * Each Pokémon is stylized original ASCII; identity is carried by color + name.
 * Add your own by dropping another entry into MON — keep it to 3 lines so the
 * frame builder and animation stay consistent.
 */

export type Mood =
	| "hatch"
	| "idle"
	| "talking"
	| "thinking"
	| "working"
	| "happy"
	| "panic"
	| "sleep"
	| "guard"
	| "running";

/** Per-mood color override (256-color); falls back to the Pokémon's own color. */
export const MOOD_COLOR: Partial<Record<Mood, number>> = {
	talking: 117,
	thinking: 141,
	working: 222,
	happy: 84,
	panic: 203,
	sleep: 244,
	guard: 214,
	running: 222,
};

export interface Mon {
	name: string;
	type: string;
	color: number;
	tag: string;
	top: string;
	bottom: string;
	/** Build the middle face line from an eyes string, e.g. (eyes) => `(${eyes})`. */
	mid: (eyes: string) => string;
	quirks: string[];
}

export const MON: Record<string, Mon> = {
	pikachu: {
		name: "Pikachu",
		type: "Electric",
		color: 220,
		tag: "⚡",
		top: " /\\_/\\",
		bottom: " >⚡<",
		mid: (e) => `(${e})`,
		quirks: ["pika pika!", "*cheeks spark*", "chuuu~", "*tail twitches*"],
	},
	charmander: {
		name: "Charmander",
		type: "Fire",
		color: 208,
		tag: "🔥",
		top: "  ,--,",
		bottom: " ~(🔥)",
		mid: (e) => `<${e}>`,
		quirks: ["*tail flickers*", "char char!", "toasty in here", "*warm glow*"],
	},
	squirtle: {
		name: "Squirtle",
		type: "Water",
		color: 39,
		tag: "💧",
		top: "  _=_",
		bottom: " <(_)>",
		mid: (e) => `(${e})`,
		quirks: ["squirtle squirt!", "*bubbles*", "cool and collected", "*splash*"],
	},
	bulbasaur: {
		name: "Bulbasaur",
		type: "Grass",
		color: 41,
		tag: "🍃",
		top: "  (~)",
		bottom: " /---\\",
		mid: (e) => `(${e})`,
		quirks: ["bulba~", "*photosynthesizing*", "growth mindset, literally", "*leaf rustle*"],
	},
	eevee: {
		name: "Eevee",
		type: "Normal",
		color: 179,
		tag: "✦",
		top: " /v__v\\",
		bottom: " >  <~",
		mid: (e) => `(${e})`,
		quirks: ["vee!", "*fluffs tail*", "so many possibilities", "*happy wiggle*"],
	},
	jigglypuff: {
		name: "Jigglypuff",
		type: "Fairy",
		color: 218,
		tag: "♪",
		top: "  .--.",
		bottom: "  '--'",
		mid: (e) => `(${e})`,
		quirks: ["jiggly~ ♪", "*hums a tune*", "don't fall asleep!", "puff puff"],
	},
	psyduck: {
		name: "Psyduck",
		type: "Water",
		color: 228,
		tag: "?",
		top: "  \\_/",
		bottom: "  J L",
		mid: (e) => `(${e})`,
		quirks: ["psy...yi?", "*holds head*", "wait, what was i doing", "*confused quack*"],
	},
};

export const EYES: Record<Mood, string[]> = {
	hatch: ["o.o"],
	idle: ["o.o", "-.-"],
	talking: ["o.o", "O.o"],
	thinking: ["•.•", "ô.ô", "·.·"],
	working: ["@.@", "°.°"],
	happy: ["^.^", "^o^"],
	panic: ["O.O", "O_O"],
	sleep: ["u.u", "-.-"],
	guard: ["◉.◉", "◔.◔", "o.o"],
	running: ["@.@", "°.°"],
};

/** Droopy, half-closed eyes used when the pet is starving (low energy). */
export const WEAK_EYES = ["-.-", "u.u"];

/** Cycling thought bubble shown while the model is reasoning. */
export const THOUGHTS = ["", " .", " ..", " ...", " 💭"];

/** Shift a line right by `n` columns to simulate horizontal motion. */
const lift = (s: string, n: number): string => (n > 0 ? " ".repeat(n) + s : s);

export interface FrameOpts {
	/** Full-energy: unlock the wider, bouncier motion range. */
	lively?: boolean;
	/** Starving: droop the eyes and damp the motion. */
	weak?: boolean;
}

/**
 * Build a 3-line frame for a Pokémon in a given mood at animation index `idx`.
 *
 * Beyond the eyes, the *body* now animates per mood: working bobs, happy dances
 * side to side, thinking floats with a thought bubble, panic jitters. Energy
 * gates the liveliness — a starving pet barely moves; a full one really dances.
 */
export function buildFrame(mon: Mon, mood: Mood, idx: number, opts: FrameOpts = {}): string[] {
	const lively = opts.lively ?? true;
	const weak = opts.weak ?? false;

	const pool = weak && (mood === "idle" || mood === "working" || mood === "thinking") ? WEAK_EYES : EYES[mood];
	const e = pool[idx % pool.length]!;

	let top = mon.top;
	let mid = mon.mid(e);
	let bottom = mon.bottom;

	switch (mood) {
		case "sleep":
			top = `${mon.top}${idx % 2 ? "  z" : " z"}`;
			break;

		case "working": {
			const bob = lively ? idx % 2 : 0; // gentle up-down sway
			top = lift(top, bob);
			mid = lift(mid, bob);
			bottom = lift(bottom, bob) + (idx % 2 ? " *" : "");
			break;
		}

		case "thinking": {
			const sway = [0, 1, 1, 0][idx % 4]!; // float
			top = lift(top, sway) + THOUGHTS[idx % THOUGHTS.length]!;
			mid = lift(mid, sway);
			bottom = lift(bottom, sway);
			break;
		}

		case "happy": {
			// Dance: sway across a wider arc when energetic, a small shuffle when not.
			const sway = (lively ? [0, 1, 2, 1] : [0, 1, 0, 1])[idx % 4]!;
			top = lift(top, sway);
			mid = lift(mid, sway);
			bottom = lift(bottom, sway) + (idx % 2 ? " ✦" : " !");
			break;
		}

		case "panic": {
			const shake = [0, 2, 0, 1][idx % 4]!; // frantic jitter
			top = lift(top, shake);
			mid = lift(mid, shake);
			bottom = lift(bottom, shake);
			break;
		}

		case "guard": {
			// On watch: alert, barely moving, sipping coffee.
			const bob = idx % 2;
			top = lift(top, bob) + (idx % 4 === 0 ? "  ☕" : "");
			mid = lift(mid, bob);
			bottom = lift(bottom, bob);
			break;
		}

		case "running": {
			const bob = lively ? idx % 2 : 0; // gentle up-down sway
			top = lift(top, bob);
			mid = lift(mid, bob);
			bottom = lift(bottom, bob) + (idx % 2 ? " =" : "");
			break;
		}
	}

	return [top, mid, bottom];
}
