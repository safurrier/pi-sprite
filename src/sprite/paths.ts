import { homedir } from "node:os";
import { join } from "node:path";

export function spriteHome(): string {
	return process.env.PI_SPRITE_HOME || join(homedir(), ".pi", "agent", "pi-sprite");
}
export const statePath = () => join(spriteHome(), "state.json");
export const petsDir = () => join(spriteHome(), "pets");
