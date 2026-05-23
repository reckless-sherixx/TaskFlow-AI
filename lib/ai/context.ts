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

export function analyzeInterruption(partialResponse: string) {
	const trimmed = partialResponse.trim();
	if (!trimmed) {
		return { completedSentences: "", interruptedSentence: "" };
	}

	const sentenceEndings = /[.!?]+(\s+|$)/g;
	let lastIndex = 0;
	let match;
	const sentences: string[] = [];

	while ((match = sentenceEndings.exec(trimmed)) !== null) {
		sentences.push(trimmed.substring(lastIndex, match.index + match[0].length));
		lastIndex = match.index + match[0].length;
	}

	const remaining = trimmed.substring(lastIndex);

	if (remaining.trim()) {
		return {
			completedSentences: sentences.join(" ").trim(),
			interruptedSentence: remaining.trim(),
		};
	} else if (sentences.length > 0) {
		const last = sentences[sentences.length - 1];
		return {
			completedSentences: sentences.slice(0, -1).join(" ").trim(),
			interruptedSentence: last.trim(),
		};
	}

	return {
		completedSentences: "",
		interruptedSentence: trimmed,
	};
}

export function buildInterruptionContext(
	partialResponse: string,
	userMessage: string,
): CoreMessage {
	const { completedSentences, interruptedSentence } = analyzeInterruption(partialResponse);

	let content = `[INTERRUPTION CONTEXT] You were speaking but the user interrupted you. `;
	if (completedSentences) {
		content += `You had fully said: "${completedSentences}". `;
	}
	if (interruptedSentence) {
		content += `You were in the middle of saying: "${interruptedSentence}" when you were cut off. `;
	}
	content += `The user interrupted with: "${userMessage}". ` +
		`Please respond to the user's interruption, continuing or adjusting your thoughts naturally from where you were cut off, but do not repeat what you already fully said.`;

	return {
		role: "system",
		content,
	};
}
