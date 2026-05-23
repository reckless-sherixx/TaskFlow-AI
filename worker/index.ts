import { type Job, Worker } from "bullmq";
import Redis from "ioredis";
import {
	createConversation,
	insertInferenceLog,
	insertMessage,
} from "../lib/db/queries";
import { redact } from "../lib/pii/redact";
import { IngestPayloadSchema } from "../lib/sdk/types";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
	maxRetriesPerRequest: null,
});

const worker = new Worker(
	"ingest",
	async (job: Job) => {
		console.log(`Processing job ${job.id}`);

		const validPayload = IngestPayloadSchema.parse(job.data);

		const redactedInput = redact(validPayload.inputPreview);
		const redactedOutput = redact(validPayload.outputPreview);

		let conversationId = validPayload.conversationId;
		let messageId = validPayload.messageId;

		if (!conversationId) {
			const conv = await createConversation({
				title: "Auto-generated conversation",
				status: "active",
				model: validPayload.model,
				provider: validPayload.provider,
			});
			conversationId = conv.id;
		}

		if (!messageId && redactedInput) {
			const msg = await insertMessage({
				conversationId,
				role: "user",
				content: redactedInput,
			});
			messageId = msg.id;
		}

		if (redactedOutput) {
			await insertMessage({
				conversationId,
				role: "assistant",
				content: redactedOutput,
			});
		}

		await insertInferenceLog({
			model: validPayload.model,
			provider: validPayload.provider,
			status: validPayload.status,
			latencyMs: validPayload.latencyMs,
			inputTokens: validPayload.tokens?.promptTokens,
			outputTokens: validPayload.tokens?.completionTokens,
			inputPreview: redactedInput,
			outputPreview: redactedOutput,
			errorMessage: validPayload.error,
			conversationId,
			messageId,
		});
	},
	{ connection },
);

worker.on("completed", (job) => {
	console.log(`Job ${job.id} completed successfully.`);
});

worker.on("failed", (job, err) => {
	console.error(`Job ${job?.id} failed:`, err);
});

console.log("Started listening to 'ingest' queue...");
