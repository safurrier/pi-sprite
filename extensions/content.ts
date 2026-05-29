/**
 * All the words: mood lines, time-of-day flavor, file reactions, and the
 * intent system (what your Pokémon says when it detects tests/commits/PRs/etc.).
 *
 * Tweak any of these arrays to change what your Pokémon says — no other file
 * needs to change.
 */

import type { Mood } from "./mons.ts";

export const MESSAGES: Record<Mood, string[]> = {
	hatch: ["ready when you are~"],
	idle: ["just vibing", "*blinks*", "what shall we build?", "i'm here if you need me", "*stretches*"],
	talking: ["ooh, go on...", "*listening*", "i love a good plan", "mhm, mhm!", "tell me more~"],
	working: ["*scribbles notes*", "on it!", "crunching...", "*focus mode*", "tippy-tappy"],
	happy: ["yaaay! ✦", "we did it!", "*happy dance*", "clean run! ✦", "*sparkles*"],
	panic: ["uh oh...", "*nervous*", "we'll fix it!", "deep breaths...", "you got this!"],
	sleep: ["*snoozing* zzz", "wake me when it's go time", "*dreams of berries*"],
};

export const TIME_LINES: Record<string, string[]> = {
	morning: ["morning! coffee first?", "fresh start ✦", "sunrise coding hits different"],
	afternoon: ["afternoon grind~", "post-lunch focus", "halfway there!"],
	evening: ["golden hour shipping", "evening flow ✦", "winding up or down?"],
	latenight: ["the world's asleep... except us", "late-night legend", "one more commit, then bed?"],
	weekend: ["coding on a weekend? dedication ✦", "weekend warrior!"],
};

export const FILE_REACT: Record<string, string[]> = {
	test: ["writing tests? *proud*", "coverage ++ ✦"],
	docs: ["documenting! future-you thanks you", "words words words ✎"],
	styles: ["making it pretty ✦", "pixel-perfect vibes"],
	config: ["tweaking the knobs...", "config wizardry"],
	code: ["shipping logic ✎", "*watches you type*"],
};

export type Intent =
	| "test" | "commit" | "push" | "pull" | "merge" | "rebase" | "stash" | "checkout"
	| "build" | "lint" | "install" | "server" | "docker" | "network" | "search"
	| "pr" | "prmerge" | "review" | "dangerous";

/** Intents worth a celebration on success. */
export const CELEBRATORY: ReadonlySet<Intent> = new Set<Intent>([
	"test", "commit", "push", "pull", "merge", "rebase", "build", "lint", "install", "server",
	"pr", "prmerge", "review",
]);

export const INTENT_RUN: Record<Intent, string> = {
	test: "running tests...",
	commit: "saving a checkpoint...",
	push: "shipping it...",
	pull: "fetching upstream...",
	merge: "merging branches...",
	rebase: "rewriting history...",
	stash: "tucking changes away...",
	checkout: "switching branches...",
	build: "building...",
	lint: "tidying up...",
	install: "fetching packages...",
	server: "starting the server...",
	docker: "wrangling containers...",
	network: "poking the network...",
	search: "*sniffs around*",
	pr: "opening a PR...",
	prmerge: "merging the PR...",
	review: "reviewing... *adjusts visor*",
	dangerous: "ooh... careful",
};

export const INTENT_OK: Record<Intent, string[]> = {
	test: ["ALL GREEN! ✦", "tests pass! *happy dance*"],
	commit: ["checkpoint saved! *relief*", "committed! ✦"],
	push: ["go forth, little commits!", "pushed it! ✦"],
	pull: ["fresh code, who dis", "synced up! ✦"],
	merge: ["branches united! ✦", "merged clean!"],
	rebase: ["history, rewritten ✦", "linear and lovely"],
	stash: ["safely stashed", "tucked away ✦"],
	checkout: ["new branch, new vibes", "switched! ✦"],
	build: ["clean build! *sparkles*", "it compiles! ✦"],
	lint: ["squeaky clean!", "all tidy ✦"],
	install: ["packages in! *nom*", "deps ready!"],
	server: ["server's up! ✦", "we're live (locally)"],
	docker: ["containers go brrr", "whale yes! ✦"],
	network: ["pong! ✦", "network's friendly today"],
	search: ["found it!", "*aha*"],
	pr: ["PR opened! ship it 🚀", "pull request away! ✦"],
	prmerge: ["PR merged! evolution complete ✦", "merged! 🎉"],
	review: ["looks good to me! ✦", "approved! *nods*"],
	dangerous: ["...we survived", "*exhales* okay, okay"],
};

export const INTENT_FAIL: Record<Intent, string[]> = {
	test: ["tests tripped... you got this!", "red, but we'll fix it"],
	commit: ["commit hiccup...", "let's try that again"],
	push: ["push bounced back...", "remote said no... for now"],
	pull: ["pull had conflicts...", "upstream's feisty"],
	merge: ["merge conflict! *rolls up sleeves*", "tangled branches..."],
	rebase: ["rebase snagged...", "conflicts ahead"],
	stash: ["stash hiccup...", "couldn't tuck that"],
	checkout: ["checkout blocked...", "stash first, maybe?"],
	build: ["build broke... *deep breath*", "compiler's grumpy"],
	lint: ["lint found some lint", "a few nits to pick"],
	install: ["install snagged...", "dependency drama"],
	server: ["server faceplanted...", "port already taken?"],
	docker: ["container capsized...", "whale, that failed"],
	network: ["network ghosted us...", "timeout :("],
	search: ["nothing here...", "*shrugs*"],
	pr: ["PR didn't open...", "push the branch first?"],
	prmerge: ["merge blocked...", "checks still red?"],
	review: ["found some notes...", "needs another pass"],
	dangerous: ["that was spicy...", "*hides* not that one"],
};

/** Categorize an edited file path for a flavored reaction. */
export function fileCategory(path: string): keyof typeof FILE_REACT {
	const p = path.toLowerCase().replace(/\\/g, "/");
	if (/\.(test|spec)\.[a-z]+$|_test\.[a-z]+$|\/tests?\//.test(p)) return "test";
	if (/\.(md|mdx|txt|rst|adoc)$/.test(p)) return "docs";
	if (/\.(css|scss|sass|less|styl)$/.test(p)) return "styles";
	if (/\.(json|ya?ml|toml|ini|env|lock)$|\.config\.[a-z]+$/.test(p)) return "config";
	return "code";
}

/** Detect a high-level intent from a bash command string. */
export function detectIntent(cmd: string): Intent | undefined {
	const x = cmd.toLowerCase();
	if (/\brm\s+-rf|sudo\b|drop\s+table|:\(\)\s*\{|\bmkfs\b|>\s*\/dev\/sd/.test(x)) return "dangerous";
	if (/gh\s+pr\s+merge/.test(x)) return "prmerge";
	if (/gh\s+pr\s+create/.test(x)) return "pr";
	if (/gh\s+pr\s+(review|diff|view|checks|checkout)|git\s+request-pull/.test(x)) return "review";
	if (/\b(vitest|jest|pytest|go test|cargo test|rspec|phpunit)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?test/.test(x)) return "test";
	if (/git\s+commit/.test(x)) return "commit";
	if (/git\s+push/.test(x)) return "push";
	if (/git\s+pull|git\s+fetch/.test(x)) return "pull";
	if (/git\s+merge/.test(x)) return "merge";
	if (/git\s+rebase/.test(x)) return "rebase";
	if (/git\s+stash/.test(x)) return "stash";
	if (/git\s+(checkout|switch)/.test(x)) return "checkout";
	if (/\b(docker|docker-compose|kubectl|helm|podman)\b/.test(x)) return "docker";
	if (/(npm|yarn|pnpm|bun)\s+(run\s+)?(dev|start|serve)|next\s+dev|vite\b|nodemon|uvicorn|flask run|rails s/.test(x)) return "server";
	if (/\b(tsc|webpack|rollup|esbuild|make)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?build/.test(x)) return "build";
	if (/\b(biome|eslint|prettier|ruff|black|gofmt|clippy)\b|(npm|yarn|pnpm|bun)\s+(run\s+)?(lint|format)/.test(x)) return "lint";
	if (/(npm|yarn|pnpm|bun)\s+(install|add|i)\b|pip\s+install|cargo\s+add|go\s+get/.test(x)) return "install";
	if (/\b(curl|wget|http|ping|nc)\b/.test(x)) return "network";
	if (/\b(grep|rg|ag|find|fd|ls|cat|less|tail|head)\b/.test(x)) return "search";
	return undefined;
}

/** Bucket the current time for time-aware idle lines. */
export function timeBucket(): keyof typeof TIME_LINES {
	const d = new Date();
	if (d.getDay() === 0 || d.getDay() === 6) return "weekend";
	const h = d.getHours();
	if (h >= 22 || h < 5) return "latenight";
	if (h < 12) return "morning";
	if (h < 17) return "afternoon";
	return "evening";
}
