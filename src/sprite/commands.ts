import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type InstalledPet, importPetFolder, listPets } from "./loader.ts";
import { installPetdexPet, listPetdexPets } from "./petdex.ts";
import type { SpriteAlign, SpriteSize } from "./renderer.ts";

export interface SpriteCommandRuntime {
	setCommandContext(ctx: ExtensionContext): void;
	statusText(): string;
	selectPet(id: string): void;
	importPetUrl(url: string): Promise<InstalledPet>;
	show(): void;
	hide(): void;
	setSize(size: SpriteSize): void;
	setLabel(visible: boolean): void;
	setAlign(align: SpriteAlign): void;
	clearTurnStatus(): void;
	setTurnStatusEnabled(enabled: boolean): void;
	clearLiveStatus(): void;
	setLiveStatusEnabled(enabled: boolean): void;
	clearNative(ctx: ExtensionContext): void;
	getSpriteName(): string;
}

const SIZE_VALUES = new Set(["tiny", "small", "medium", "large"]);
const ALIGN_VALUES = new Set(["left", "right"]);

function usage(command = "/pet"): string {
	return `Usage: ${command} [list|choose <id>|import <path>|import-url <url>|create [brief]|gallery|search <query>|preview <slug>|install <slug>|hide|show|size <tiny|small|medium|large>|label <on|off>|align <left|right>|turn-status <on|off|clear>|live-status <on|off|clear>|clear-native]`;
}

function requireValue(value: string, message: string): string {
	if (!value) throw new Error(message);
	return value;
}

function sendUserMessage(pi: ExtensionAPI, ctx: ExtensionCommandContext, message: string): void {
	if (ctx.isIdle()) pi.sendUserMessage(message);
	else pi.sendUserMessage(message, { deliverAs: "followUp" });
}

export function petCreatePrompt(brief: string): string {
	const trimmed = brief.trim();
	return [
		"/skill:pi-sprite-authoring",
		"",
		"Help me create a custom pi-sprite pet folder that can be imported with `/pet import <absolute-folder>`.",
		trimmed
			? `Initial user brief: ${trimmed}`
			: "Start by asking for the pet concept, style references, and desired states.",
		"Use the packaged pi-sprite-authoring workflow: direction cards when the design is open, a canonical idle anchor before other states, manifest validation, and a final import command.",
		"If the user wants OpenAI/GPT image generation, explain that it requires an OpenAI API key such as `OPENAI_API_KEY`; otherwise offer prompt-only, hand-drawn/reference-driven, or local template paths that do not need that key.",
	].join("\n");
}

export function registerSpriteCommands(pi: ExtensionAPI, runtime: SpriteCommandRuntime): void {
	async function handlePetCommand(args: string, ctx: ExtensionCommandContext, commandName = "/pet"): Promise<void> {
		runtime.setCommandContext(ctx);
		const [cmd = "", ...rest] = args.trim().split(/\s+/u).filter(Boolean);
		const value = rest.join(" ").trim();
		switch (cmd || "status") {
			case "status":
				ctx.ui.notify(runtime.statusText(), "info");
				break;
			case "list": {
				const pets = listPets();
				ctx.ui.notify(
					pets.length ? pets.map((pet) => `${pet.id} - ${pet.manifest.name}`).join("\n") : "No imported pets yet.",
					"info",
				);
				break;
			}
			case "choose":
				runtime.selectPet(requireValue(value, `Usage: ${commandName} choose <id>`));
				ctx.ui.notify(`Selected ${runtime.getSpriteName()}.`, "info");
				break;
			case "import": {
				const pet = importPetFolder(requireValue(value, `Usage: ${commandName} import <path>`));
				runtime.selectPet(pet.id);
				ctx.ui.notify(`Imported and selected ${pet.manifest.name}.`, "info");
				break;
			}
			case "import-url": {
				const pet = await runtime.importPetUrl(requireValue(value, `Usage: ${commandName} import-url <url>`));
				runtime.selectPet(pet.id);
				ctx.ui.notify(`Imported and selected ${pet.manifest.name}.`, "info");
				break;
			}
			case "create":
			case "author":
				sendUserMessage(pi, ctx, petCreatePrompt(value));
				ctx.ui.notify(
					"Queued pi-sprite authoring help. OpenAI/GPT image generation requires an OpenAI API key such as OPENAI_API_KEY; template, prompt-only, and manual import flows do not.",
					"info",
				);
				break;
			case "gallery":
			case "search": {
				const pets = await listPetdexPets(value);
				ctx.ui.notify(
					pets.length
						? `Petdex gallery:\n${pets.map((pet) => `${pet.id} - ${pet.displayName}${pet.installed ? " (installed)" : ""}`).join("\n")}`
						: "No Petdex pets matched.",
					"info",
				);
				break;
			}
			case "preview": {
				const slug = requireValue(value, `Usage: ${commandName} preview <slug>`);
				const matches = await listPetdexPets(slug);
				const pet = matches.find((candidate) => candidate.id === slug) ?? matches[0];
				if (!pet) throw new Error(`No Petdex pet found for ${slug}`);
				ctx.ui.notify(
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
				const pet = await installPetdexPet(requireValue(value, `Usage: ${commandName} install <slug>`));
				runtime.selectPet(pet.id);
				ctx.ui.notify(`Installed and selected ${pet.manifest.name}.`, "info");
				break;
			}
			case "hide":
				runtime.hide();
				ctx.ui.notify("pi-sprite hidden. /pet show to restore.", "info");
				break;
			case "show":
				runtime.show();
				ctx.ui.notify("pi-sprite shown.", "info");
				break;
			case "size": {
				if (!SIZE_VALUES.has(value)) throw new Error("Usage: /pet size <tiny|small|medium|large>");
				runtime.setSize(value as SpriteSize);
				ctx.ui.notify(`pi-sprite size set to ${value}.`, "info");
				break;
			}
			case "label":
				if (value !== "on" && value !== "off") throw new Error("Usage: /pet label <on|off>");
				runtime.setLabel(value === "on");
				ctx.ui.notify(`pi-sprite label ${value === "on" ? "shown" : "hidden"}.`, "info");
				break;
			case "align":
				if (!ALIGN_VALUES.has(value)) throw new Error("Usage: /pet align <left|right>");
				runtime.setAlign(value as SpriteAlign);
				ctx.ui.notify(`pi-sprite aligned ${value}.`, "info");
				break;
			case "turn-status":
				if (value !== "on" && value !== "off" && value !== "clear") {
					throw new Error("Usage: /pet turn-status <on|off|clear>");
				}
				if (value === "clear") {
					runtime.clearTurnStatus();
					ctx.ui.notify("Cleared pi-sprite turn status.", "info");
					break;
				}
				runtime.setTurnStatusEnabled(value === "on");
				ctx.ui.notify(`pi-sprite turn status ${value === "on" ? "enabled" : "disabled"}.`, "info");
				break;
			case "live-status":
				if (value !== "on" && value !== "off" && value !== "clear") {
					throw new Error("Usage: /pet live-status <on|off|clear>");
				}
				if (value === "clear") {
					runtime.clearLiveStatus();
					ctx.ui.notify("Cleared pi-sprite live status.", "info");
					break;
				}
				runtime.setLiveStatusEnabled(value === "on");
				ctx.ui.notify(`pi-sprite live status ${value === "on" ? "enabled" : "disabled"}.`, "info");
				break;
			case "clear-native":
				runtime.clearNative(ctx);
				ctx.ui.notify("Requested native terminal image cleanup. /pet show redraws the sprite.", "info");
				break;
			default:
				ctx.ui.notify(usage(commandName), "info");
		}
	}

	pi.registerCommand("pet", {
		description:
			"sprite companion: list | choose <id> | import <path> | import-url <url> | create [brief] | gallery | search <query> | preview <slug> | install <slug> | hide | show | size <tiny|small|medium|large> | label <on|off> | align <left|right> | turn-status <on|off|clear> | live-status <on|off|clear> | clear-native",
		handler: async (args: string, ctx: ExtensionCommandContext) => handlePetCommand(args, ctx, "/pet"),
	});
	pi.registerCommand("sprite", {
		description: "Alias for /pet from the pi-sprite package",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			if (!args.trim()) {
				ctx.ui.notify("pi-sprite uses /pet as its main command. Try /pet help, /pet create, or /pet import.", "info");
				return;
			}
			await handlePetCommand(args, ctx, "/sprite");
		},
	});
}
