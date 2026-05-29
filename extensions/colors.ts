/**
 * 256-color ANSI helpers (honors NO_COLOR). Safe in Terminal.app and Warp.
 */

export const NO_COLOR = Boolean(process.env.NO_COLOR);

const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/** Wrap text in a 256-color foreground code. */
export const c = (code: number, text: string): string =>
	NO_COLOR ? text : `\x1b[38;5;${code}m${text}${RESET}`;

/** Dim text. */
export const dim = (text: string): string => (NO_COLOR ? text : `${DIM}${text}${RESET}`);

/** A 4-cell (default) progress bar from a 0-100 percentage. */
export function bar(pct: number, cells = 4): string {
	const filled = Math.max(0, Math.min(cells, Math.round((pct / 100) * cells)));
	return "▓".repeat(filled) + "░".repeat(cells - filled);
}
