export type CoreMessage = { role: string; content: any };

export const MAX_CONTEXT_MESSAGES = 20;
export const TOKEN_WARNING_THRESHOLD = 8000;


export function buildContextWindow(
	history: CoreMessage[],
	maxMessages = MAX_CONTEXT_MESSAGES,
): CoreMessage[] {
	if (history.length <= maxMessages) return [...history];
	return history.slice(-maxMessages);
}


export function estimateTokens(messages: CoreMessage[]): number {
	let charCount = 0;
	for (const msg of messages) {
		if (typeof msg.content === "string") {
			charCount += msg.content.length;
		} else if (Array.isArray(msg.content)) {
			for (const part of msg.content) {
				if ("text" in part && typeof part.text === "string") {
					charCount += part.text.length;
				}
			}
		}
	}
	return Math.ceil(charCount / 4);
}

export function warnIfOverBudget(
	messages: CoreMessage[],
	systemPrompt: string,
): void {
	const contextTokens = estimateTokens(messages);
	const systemTokens = Math.ceil(systemPrompt.length / 4);
	const total = contextTokens + systemTokens;

	if (total > TOKEN_WARNING_THRESHOLD) {
		console.warn(
			`[token-guard] Estimated ${total} tokens (threshold: ${TOKEN_WARNING_THRESHOLD}). ` +
			`Context: ${messages.length} messages, ${contextTokens} est. tokens.`,
		);
	}
}
