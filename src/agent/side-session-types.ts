export type SideCompletionRequest = {
	prompt: string;
	systemPrompt?: string;
	maxTokens?: number;
	timeoutMs?: number;
};

export type SideCompletionFailureReason = "no-model" | "timeout" | "empty" | "error";

export type SideCompletionResult =
	| { ok: true; text: string }
	| { ok: false; reason: SideCompletionFailureReason; message: string };
