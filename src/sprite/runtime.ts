import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { importPetFolder, listPets, loadPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";
import { spriteHome, statePath } from "./paths.ts";

interface SavedState {
	selectedPetId?: string;
	visible?: boolean;
}

const DEFAULT_FRAMES: Record<SpriteState, string[]> = {
	idle: ["  ◕‿◕  ", "pi-sprite · idle"],
	thinking: ["  ◔_◔  ", "pi-sprite · thinking"],
	working: ["  ◕_◕⌨ ", "pi-sprite · working"],
	success: ["  ◕‿◕✦ ", "pi-sprite · success"],
	error: ["  ◕︵◕  ", "pi-sprite · error"],
};

function loadSaved(): SavedState {
	try {
		return JSON.parse(readFileSync(statePath(), "utf8")) as SavedState;
	} catch {
		return {};
	}
}
function saveSaved(state: SavedState): void {
	mkdirSync(spriteHome(), { recursive: true });
	writeFileSync(statePath(), `${JSON.stringify(state, null, 2)}\n`);
}

export function createSpriteRuntime() {
	let ctx: ExtensionContext | undefined;
	let state: SpriteState = "idle";
	let selectedPetId = "";
	let visible = true;
	let resetTimer: ReturnType<typeof setTimeout> | undefined;
	let lastSignature = "";

	function selectedName(): string {
		return selectedPetId ? (loadPet(selectedPetId)?.manifest.name ?? selectedPetId) : "default";
	}

	function linesForCurrentState(): string[] {
		const pet = selectedPetId ? loadPet(selectedPetId) : undefined;
		if (!pet) return DEFAULT_FRAMES[state];
		const spritePath = pet.manifest.sprites[state] ?? pet.manifest.sprites.idle;
		return [`  ◕‿◕  ${pet.manifest.name}`, `pi-sprite · ${state}${spritePath ? ` · ${basename(spritePath)}` : ""}`];
	}

	function render(): void {
		if (!ctx?.hasUI) return;
		if (!visible) {
			ctx.ui.setWidget("pi-sprite", undefined, { placement: "belowEditor" });
			lastSignature = "hidden";
			return;
		}
		const lines = linesForCurrentState();
		const signature = lines.join("\n");
		if (signature === lastSignature) return;
		lastSignature = signature;
		ctx.ui.setWidget("pi-sprite", lines, { placement: "belowEditor" });
	}

	function persist(): void {
		saveSaved({ selectedPetId, visible });
	}

	return {
		async start(nextCtx: ExtensionContext) {
			ctx = nextCtx;
			const saved = loadSaved();
			selectedPetId = saved.selectedPetId ?? selectedPetId;
			visible = saved.visible ?? true;
			state = "idle";
			render();
		},
		setState(next: SpriteState, options: { resetMs?: number } = {}) {
			if (resetTimer) clearTimeout(resetTimer);
			state = next;
			render();
			if (options.resetMs) resetTimer = setTimeout(() => this.setState("idle"), options.resetMs);
		},
		shutdown() {
			if (resetTimer) clearTimeout(resetTimer);
			resetTimer = undefined;
			persist();
		},
		registerCommands(pi: ExtensionAPI) {
			pi.registerCommand("pet", {
				description: "sprite companion: list | choose <id> | import <path> | hide | show",
				handler: async (args: string, commandCtx: ExtensionContext) => {
					ctx = commandCtx;
					const [cmd = "", ...rest] = args.trim().split(/\s+/u).filter(Boolean);
					const value = rest.join(" ").trim();
					switch (cmd || "status") {
						case "status":
							commandCtx.ui.notify(
								`pi-sprite: ${visible ? "shown" : "hidden"}; pet=${selectedName()}; state=${state}`,
								"info",
							);
							break;
						case "list": {
							const pets = listPets();
							commandCtx.ui.notify(
								pets.length ? pets.map((p) => `${p.id} - ${p.manifest.name}`).join("\n") : "No imported pets yet.",
								"info",
							);
							break;
						}
						case "choose": {
							if (!value) throw new Error("Usage: /pet choose <id>");
							if (!loadPet(value)) throw new Error(`Unknown pet ${value}. Try /pet list.`);
							selectedPetId = value;
							visible = true;
							persist();
							lastSignature = "";
							render();
							commandCtx.ui.notify(`Selected ${selectedName()}.`, "info");
							break;
						}
						case "import": {
							if (!value) throw new Error("Usage: /pet import <path>");
							const pet = importPetFolder(value);
							selectedPetId = pet.id;
							visible = true;
							persist();
							lastSignature = "";
							render();
							commandCtx.ui.notify(`Imported and selected ${pet.manifest.name}.`, "info");
							break;
						}
						case "hide":
							visible = false;
							persist();
							render();
							commandCtx.ui.notify("pi-sprite hidden. /pet show to restore.", "info");
							break;
						case "show":
							visible = true;
							persist();
							lastSignature = "";
							render();
							commandCtx.ui.notify("pi-sprite shown.", "info");
							break;
						default:
							commandCtx.ui.notify("Usage: /pet [list|choose <id>|import <path>|hide|show]", "info");
					}
				},
			});
		},
	};
}
