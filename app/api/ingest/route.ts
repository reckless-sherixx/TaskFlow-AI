import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { enqueueLog } from "../../../lib/queue/producer";
import { IngestPayloadSchema } from "../../../lib/sdk/types";

export async function POST(req: Request) {
	try {
		const rawPayload = await req.json();

		const validPayload = IngestPayloadSchema.parse(rawPayload);

		// Fire and forget enqueueing — never blocks the SDK/user response
		enqueueLog(validPayload).catch((err) => {
			console.error("[Ingest API] Failed to enqueue log:", err);
		});

		return NextResponse.json({ success: true }, { status: 200 });
	} catch (error) {
		if (error instanceof ZodError) {
			return NextResponse.json(
				{ error: "Invalid payload format", details: error },
				{ status: 400 },
			);
		}

		console.error("[Ingest API] Failed to parse JSON body:", error);
		return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
	}
}
