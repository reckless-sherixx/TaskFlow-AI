import Redis from "ioredis";
import { NextResponse } from "next/server";
import {
	cancelConversation,
	getConversationWithMessages,
} from "../../../../lib/db/queries";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ id: string }> | { id: string } },
) {
	try {
		const resolvedParams = await params;
		const id = resolvedParams.id;

		const conversation = await getConversationWithMessages(id);

		if (!conversation) {
			return NextResponse.json({ error: "Not found" }, { status: 404 });
		}

		return NextResponse.json({ success: true, conversation }, { status: 200 });
	} catch (error) {
		console.error("Fetch failed:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function DELETE(
	req: Request,
	{ params }: { params: Promise<{ id: string }> | { id: string } },
) {
	try {
		const resolvedParams = await params;
		const id = resolvedParams.id;

		await cancelConversation(id);

		await redis.publish(
			"cancel-session",
			JSON.stringify({ conversationId: id }),
		);

		return NextResponse.json({ success: true }, { status: 200 });
	} catch (error) {
		console.error("Cancel failed:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
