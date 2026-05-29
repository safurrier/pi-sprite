/**
 * The Pokémon roster and frame builder.
 *
 * Each Pokémon is stylized original ASCII; identity is carried by color + name.
 * Add your own by dropping another entry into MON — keep it to 3 lines so the
 * frame builder and animation stay consistent.
 */

export type Mood = "hatch" | "idle" | "talking" | "working" | "happy" | "panic" | "sleep";

/** Per-mood color override (256-color); falls back to the Pokémon's own color. */
export const MOOD_COLOR: Partial<Record<Mood, number>> = {
	talking: 117,
	working: 222,
	happy: 84,
	panic: 203,
	sleep: 244,
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

const EYES: Record<Mood, string[]> = {
	hatch: ["o.o"],
	idle: ["o.o", "-.-"],
	talking: ["o.o", "O.o"],
	working: ["@.@", "°.°"],
	happy: ["^.^", "^o^"],
	panic: ["O.O", "O_O"],
	sleep: ["u.u", "-.-"],
};

/** Build a 3-line frame for a Pokémon in a given mood at animation index `idx`. */
export function buildFrame(mon: Mon, mood: Mood, idx: number): string[] {
	const eyes = EYES[mood];
	const e = eyes[idx % eyes.length]!;
	let top = mon.top;
	let bottom = mon.bottom;
	if (mood === "sleep") top = `${mon.top}${idx % 2 ? "  z" : " z"}`;
	if (mood === "working") bottom = `${mon.bottom}${idx % 2 ? " *" : ""}`;
	if (mood === "happy") bottom = `${mon.bottom}${idx % 2 ? " !" : " ✦"}`;
	return [top, mon.mid(e), bottom];
}
