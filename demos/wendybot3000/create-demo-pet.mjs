#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

function arg(name, fallback = "") {
	const index = process.argv.indexOf(`--${name}`);
	return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const out = arg("out", "/tmp/wendybot3000-sprite");
mkdirSync(out, { recursive: true });

const manifest = {
	id: "wendybot3000",
	name: "WendyBot3000",
	description: "A tiny release-demo robot companion for pi-sprite.",
	personality: "Sweet, loyal, curious, and a little goofy. Keep BTW answers short and grounded.",
	sprites: {
		idle: "idle.png",
		thinking: "thinking.png",
		working: "working.png",
		success: "success.png",
		error: "error.png",
	},
};

writeFileSync(join(out, "pet.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const states = {
	idle: { accent: "#8bd5ff", eyes: "#111827", mouth: "M55 78 H73", antenna: "#a6e3a1" },
	thinking: { accent: "#cba6f7", eyes: "#111827", mouth: "M58 80 H70", antenna: "#f9e2af" },
	working: { accent: "#89b4fa", eyes: "#111827", mouth: "M54 78 H74", antenna: "#89dceb" },
	success: { accent: "#a6e3a1", eyes: "#166534", mouth: "M54 76 Q64 86 74 76", antenna: "#f9e2af" },
	error: { accent: "#f38ba8", eyes: "#7f1d1d", mouth: "M55 84 Q64 76 73 84", antenna: "#f38ba8" },
};

function svgFor(state, spec) {
	const sparkle =
		state === "success" ? '<path d="M92 28 L96 38 L106 42 L96 46 L92 56 L88 46 L78 42 L88 38 Z" fill="#f9e2af"/>' : "";
	const wrench =
		state === "working"
			? '<path d="M84 84 l16 16" stroke="#bac2de" stroke-width="5" stroke-linecap="round"/><circle cx="82" cy="82" r="6" fill="#bac2de"/>'
			: "";
	const question =
		state === "thinking"
			? '<text x="86" y="40" font-family="Menlo, monospace" font-size="22" fill="#f9e2af">?</text>'
			: "";
	return `
  <svg width="128" height="128" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
    <rect width="128" height="128" fill="none"/>
    <path d="M64 20 V34" stroke="${spec.antenna}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="64" cy="16" r="7" fill="${spec.antenna}"/>
    <rect x="30" y="34" width="68" height="58" rx="18" fill="#313244" stroke="${spec.accent}" stroke-width="5"/>
    <rect x="42" y="48" width="44" height="24" rx="10" fill="#cdd6f4"/>
    <circle cx="55" cy="60" r="5" fill="${spec.eyes}"/>
    <circle cx="73" cy="60" r="5" fill="${spec.eyes}"/>
    <path d="${spec.mouth}" stroke="${spec.eyes}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <rect x="22" y="52" width="10" height="24" rx="5" fill="${spec.accent}"/>
    <rect x="96" y="52" width="10" height="24" rx="5" fill="${spec.accent}"/>
    <path d="M48 92 V106 M80 92 V106" stroke="#585b70" stroke-width="7" stroke-linecap="round"/>
    ${sparkle}${wrench}${question}
  </svg>`;
}

for (const [state, spec] of Object.entries(states)) {
	await sharp(Buffer.from(svgFor(state, spec)))
		.png()
		.toFile(join(out, `${state}.png`));
}

console.log(`Created WendyBot3000 demo pet at ${out}`);
console.log(`Import in Pi: /pet import ${out}`);
