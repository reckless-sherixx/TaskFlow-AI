import { z } from "zod";

export const TokenUsageSchema = z.object({
	promptTokens: z.number().optional(),
	completionTokens: z.number().optional(),
	totalTokens: z.number().optional(),
});

export const IngestPayloadSchema = z.object({
	model: z.string(),
	provider: z.string(),
	status: z.enum(["success", "error"]),
	latencyMs: z.number(),
	tokens: TokenUsageSchema.optional(),
	sessionId: z.string().optional(),
	conversationId: z.string().optional(),
	messageId: z.string().optional(),
	inputPreview: z.string().optional(),
	outputPreview: z.string().optional(),
	error: z.string().optional(),
});

export type IngestPayload = z.infer<typeof IngestPayloadSchema>;
