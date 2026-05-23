import { NextResponse } from "next/server";
import { registry } from "../../../lib/metrics/prometheus";

export async function GET() {
  try {
    let metrics = await registry.metrics();

    try {
      const res = await fetch("http://127.0.0.1:8080/metrics", {
        next: { revalidate: 0 }
      });
      if (res.ok) {
        const wsMetrics = await res.text();
        metrics += "\n" + wsMetrics;
      }
    } catch (wsErr) {
      console.warn("Could not fetch metrics from WS server:", wsErr instanceof Error ? wsErr.message : wsErr);
    }

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
