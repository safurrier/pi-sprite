import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";

const DEMO_TIMESTAMP = Date.parse("2026-07-06T20:10:00.000Z");

function latestText(context) {
	const parts = [];
	if (context.systemPrompt) parts.push(context.systemPrompt);
	for (let i = context.messages.length - 1; i >= 0; i--) {
		const message = context.messages[i];
		if (message?.role !== "user") continue;
		if (typeof message.content === "string") parts.push(message.content);
		else if (Array.isArray(message.content)) {
			parts.push(message.content.map((part) => (part.type === "text" ? part.text : "")).join("\n"));
		}
		break;
	}
	return parts.join("\n\n");
}

function demoResponse(prompt) {
	if (/Summarize the current in-progress work/iu.test(prompt)) {
		return JSON.stringify({
			label: "Watch footer status",
			detail: "Calling attention to the bottom Pi status line and native sprite.",
		});
	}
	if (/Classify the final state of this Pi coding-agent turn/iu.test(prompt)) {
		return JSON.stringify({
			state: "followup",
			label: "Watch footer status",
			detail: "The bottom footer shows the selected pet and the current turn status.",
			actions: ["Review native capture"],
		});
	}
	if (/Create a short executive summary/iu.test(prompt)) {
		return [
			"TL;DR: pi-sprite is ready for a release-focused docs and demo pass.",
			"Recent work: WendyBot3000 was imported, selected, and used to show context, BTW, and recap flows.",
			"Current status: The demo uses a scrubbed fixture session plus a local demo model, so it is repeatable without external API calls.",
			"Next: Review the demo, then follow with the npm release-prep PR.",
		].join("\n");
	}
	if (/Side question:/iu.test(prompt)) {
		return "Check the package tarball, docs links, CI, and npm trusted-publishing setup. Then tag the release only after a clean install smoke test.";
	}
	if (/Look at the footer status line|Fix demo sprite/iu.test(prompt)) {
		return "Look at the bottom footer: pi-sprite shows the selected pet plus a compact turn status while the native sprite stays docked on the right.";
	}
	return "WendyBot3000 is loaded. This fixture session shows pi-sprite's real TUI commands without calling an external model.";
}

function assistantMessage(model, text) {
	const input = Math.max(200, Math.ceil(text.length / 2));
	const output = Math.ceil(text.length / 4);
	return {
		api: "pi-sprite-demo",
		provider: "pi-sprite-demo",
		model: model.id,
		content: [{ type: "text", text }],
		usage: {
			input,
			output,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: input + output,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: DEMO_TIMESTAMP,
	};
}

function streamDemo(model, context, _options) {
	const stream = createAssistantMessageEventStream();
	queueMicrotask(() => {
		const text = demoResponse(latestText(context));
		const message = assistantMessage(model, text);
		const partialStart = { ...message, content: [] };
		const partialText = { ...message, content: [{ type: "text", text }] };
		stream.push({ type: "start", partial: partialStart });
		stream.push({ type: "text_start", contentIndex: 0, partial: partialStart });
		stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: partialText });
		stream.push({ type: "text_end", contentIndex: 0, content: text, partial: partialText });
		stream.push({ type: "done", reason: "stop", message });
	});
	return stream;
}

export default function demoProvider(pi) {
	pi.registerProvider("pi-sprite-demo", {
		name: "pi-sprite demo",
		baseUrl: "http://127.0.0.1/pi-sprite-demo",
		apiKey: "demo",
		api: "pi-sprite-demo",
		streamSimple: streamDemo,
		models: [
			{
				id: "wendybot3000",
				name: "WendyBot3000 demo model",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 32000,
				maxTokens: 1200,
			},
		],
	});
}
