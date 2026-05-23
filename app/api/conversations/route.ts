import { NextResponse } from "next/server";
import { getConversationsWithStats } from "../../../lib/db/queries";

export async function GET() {
	try {
		const conversations = await getConversationsWithStats();
		return NextResponse.json({ success: true, conversations }, { status: 200 });
	} catch (error) {
		console.error("Failed to fetch list:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
