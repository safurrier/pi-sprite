import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { importPetFolder, importPetZip, listPets, loadPet } from "./loader.ts";
import type { SpriteState } from "./manifest.ts";
import { spriteHome, statePath } from "./paths.ts";
import { installPetdexPet, listPetdexPets } from "./petdex.ts";
import { renderSpriteFrame } from "./renderer.ts";

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
	let renderGeneration = 0;

	function selectedName(): string {
		return selectedPetId ? (loadPet(selectedPetId)?.manifest.name ?? selectedPetId) : "default";
	}

	function defaultLines(): string[] {
		return DEFAULT_FRAMES[state];
	}

	function render(): void {
		if (!ctx?.hasUI) return;
		const currentCtx = ctx;
		if (!visible) {
			currentCtx.ui.setWidget("pi-sprite", undefined, { placement: "belowEditor" });
			lastSignature = "hidden";
			return;
		}
		const generation = ++renderGeneration;
		const pet = selectedPetId ? loadPet(selectedPetId) : undefined;
		if (!pet) {
			const lines = defaultLines();
			const signature = lines.join("\n");
			if (signature === lastSignature) return;
			lastSignature = signature;
			currentCtx.ui.setWidget("pi-sprite", lines, { placement: "belowEditor" });
			return;
		}
		const spritePath = pet.manifest.sprites[state] ?? pet.manifest.sprites.idle;
		currentCtx.ui.setWidget(
			"pi-sprite",
			[`  ◕‿◕  ${pet.manifest.name}`, `pi-sprite · loading ${state}${spritePath ? ` · ${basename(spritePath)}` : ""}`],
			{ placement: "belowEditor" },
		);
		void renderSpriteFrame(pet, state).then((frame) => {
			if (generation !== renderGeneration || !visible || ctx !== currentCtx) return;
			if (frame.signature === lastSignature) return;
			lastSignature = frame.signature;
			currentCtx.ui.setWidget("pi-sprite", frame.lines, { placement: "belowEditor" });
		});
	}

	function persist(): void {
		saveSaved({ selectedPetId, visible });
	}

	function activatePet(id: string): void {
		if (!loadPet(id)) throw new Error(`Unknown pet ${id}. Try /pet list.`);
		selectedPetId = id;
		visible = true;
		persist();
		lastSignature = "";
		render();
	}

	async function importPetUrl(urlText: string) {
		const url = new URL(urlText);
		if (url.protocol !== "https:") throw new Error("/pet import-url requires an https URL");
		const response = await fetch(url);
		if (!response.ok) throw new Error(`download failed (${response.status})`);
		const bytes = Buffer.from(await response.arrayBuffer());
		if (bytes.length > 25 * 1024 * 1024) throw new Error("download is too large");
		const tmp = join(spriteHome(), `import-${Date.now()}.zip`);
		mkdirSync(spriteHome(), { recursive: true });
		writeFileSync(tmp, bytes);
		try {
			return importPetZip(tmp);
		} finally {
			rmSync(tmp, { force: true });
		}
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
				description:
					"sprite companion: list | choose <id> | import <path> | import-url <url> | gallery | search <query> | preview <slug> | install <slug> | hide | show",
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
							activatePet(value);
							commandCtx.ui.notify(`Selected ${selectedName()}.`, "info");
							break;
						}
						case "import": {
							if (!value) throw new Error("Usage: /pet import <path>");
							const pet = importPetFolder(value);
							activatePet(pet.id);
							commandCtx.ui.notify(`Imported and selected ${pet.manifest.name}.`, "info");
							break;
						}
						case "import-url": {
							if (!value) throw new Error("Usage: /pet import-url <url>");
							const pet = await importPetUrl(value);
							activatePet(pet.id);
							commandCtx.ui.notify(`Imported and selected ${pet.manifest.name}.`, "info");
							break;
						}
						case "gallery":
						case "search": {
							const pets = await listPetdexPets(value);
							commandCtx.ui.notify(
								pets.length
									? `Petdex gallery:\n${pets.map((pet) => `${pet.id} - ${pet.displayName}${pet.installed ? " (installed)" : ""}`).join("\n")}`
									: "No Petdex pets matched.",
								"info",
							);
							break;
						}
						case "preview": {
							if (!value) throw new Error("Usage: /pet preview <slug>");
							const pet =
								(await listPetdexPets(value)).find((candidate) => candidate.id === value) ??
								(await listPetdexPets(value))[0];
							if (!pet) throw new Error(`No Petdex pet found for ${value}`);
							commandCtx.ui.notify(
								[
									pet.displayName,
									`id: ${pet.id}`,
									pet.kind ? `kind: ${pet.kind}` : "",
									pet.submittedBy ? `by: ${pet.submittedBy}` : "",
									`installed: ${pet.installed ? "yes" : "no"}`,
									`Install: /pet install ${pet.id}`,
								]
									.filter(Boolean)
									.join("\n"),
								"info",
							);
							break;
						}
						case "install": {
							if (!value) throw new Error("Usage: /pet install <slug>");
							const pet = await installPetdexPet(value);
							activatePet(pet.id);
							commandCtx.ui.notify(`Installed and selected ${pet.manifest.name}.`, "info");
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
							commandCtx.ui.notify(
								"Usage: /pet [list|choose <id>|import <path>|import-url <url>|gallery|search <query>|preview <slug>|install <slug>|hide|show]",
								"info",
							);
					}
				},
			});
		},
	};
}
