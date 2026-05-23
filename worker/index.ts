import { type Job, Worker } from "bullmq";
import Redis from "ioredis";
import { insertInferenceLog } from "../lib/db/queries";
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

		// Inference telemetry only — conversation/message persistence
		// is handled directly by the WebSocket server for reliability.
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
			conversationId: validPayload.conversationId,
			messageId: validPayload.messageId,
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
