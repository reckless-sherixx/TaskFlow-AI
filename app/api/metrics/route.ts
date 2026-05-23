import { NextResponse } from "next/server";
import { registry } from "../../../lib/metrics/prometheus";

export async function GET() {
  try {
    const metrics = await registry.metrics();
    return new NextResponse(metrics, {
      status: 200,
      headers: {
        "Content-Type": registry.contentType,
      },
    });
  } catch (error) {
    console.error("Failed to generate metrics:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
