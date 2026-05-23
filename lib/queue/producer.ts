import { Queue } from "bullmq";
import Redis from "ioredis";
import type { IngestPayload } from "../sdk/types";

const connection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
	maxRetriesPerRequest: null,
});

export const ingestQueue = new Queue("ingest", { connection });

export async function enqueueLog(payload: IngestPayload) {
	return ingestQueue.add("process-log", payload, {
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 1000,
		},
	});
}
