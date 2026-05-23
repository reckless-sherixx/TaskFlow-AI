// Centralized AI error classifier.

type ClassifiedError = {
	userMessage: string;
	code: string;
	shouldLog: boolean;
};

const ERROR_MAP: Array<{ pattern: RegExp; code: string; message: string }> = [
	{
		pattern: /RESOURCE_EXHAUSTED|rate.?limit|429|quota.*exceeded/i,
		code: "RATE_LIMITED",
		message: "You've exceeded the model's rate limit. Please wait a moment and try again.",
	},
	{
		pattern: /QUOTA_EXCEEDED|billing|payment/i,
		code: "QUOTA_EXCEEDED",
		message: "You've hit the usage quota for this model. Try again later or switch models.",
	},
	{
		pattern: /MODEL_NOT_FOUND|model.*not.*found|does not exist/i,
		code: "MODEL_NOT_FOUND",
		message: "This model is not available. Please select a different one.",
	},
	{
		pattern: /PERMISSION_DENIED|api.?key|unauthorized|403/i,
		code: "PERMISSION_DENIED",
		message: "API key is invalid or doesn't have access to this model.",
	},
	{
		pattern: /UNAVAILABLE|503|service.*unavailable|overloaded/i,
		code: "SERVICE_UNAVAILABLE",
		message: "The AI service is temporarily unavailable. Try again shortly.",
	},
	{
		pattern: /INVALID_ARGUMENT|invalid.*request|400/i,
		code: "INVALID_REQUEST",
		message: "The request was malformed. Please try again.",
	},
	{
		pattern: /DEADLINE_EXCEEDED|timeout|timed.?out/i,
		code: "TIMEOUT",
		message: "The request timed out. Please try again.",
	},
	{
		pattern: /safety|blocked|content.?filter/i,
		code: "CONTENT_BLOCKED",
		message: "The response was blocked by the content safety filter. Please rephrase your message.",
	},
];

export function classifyAIError(err: unknown): ClassifiedError {
	if (err instanceof Error && err.name === "AbortError") {
		return { userMessage: "", code: "ABORT", shouldLog: false };
	}

	const rawMessage = err instanceof Error ? err.message : String(err);

	for (const entry of ERROR_MAP) {
		if (entry.pattern.test(rawMessage)) {
			return {
				userMessage: entry.message,
				code: entry.code,
				shouldLog: true,
			};
		}
	}

	return {
		userMessage: "Something went wrong. Please try again.",
		code: "UNKNOWN",
		shouldLog: true,
	};
}
