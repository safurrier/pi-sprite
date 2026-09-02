import { SPRITE_STATES, type SpriteState } from "./manifest.ts";

export const PI_SPRITE_CONTROL_EVENT = "pi-sprite:control";

export interface PiSpriteControl {
	state: SpriteState;
	resetMs?: number;
}

/** Validate the deliberately small inter-extension control surface. */
export function parsePiSpriteControl(value: unknown): PiSpriteControl | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const input = value as Record<string, unknown>;
	const state =
		typeof input.state === "string" && SPRITE_STATES.includes(input.state as SpriteState)
			? (input.state as SpriteState)
			: undefined;
	const resetMs =
		typeof input.resetMs === "number" && Number.isFinite(input.resetMs) && input.resetMs >= 1 && input.resetMs <= 60_000
			? Math.floor(input.resetMs)
			: undefined;
	if (!state) return undefined;
	return { state, ...(resetMs === undefined ? {} : { resetMs }) };
}
