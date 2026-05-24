import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const res = await fetch("http://127.0.0.1:8080/metrics", {
      cache: "no-store",
    });
    
    if (!res.ok) {
      throw new Error(`WS server returned ${res.status}`);
    }

    const wsMetrics = await res.text();

    return new NextResponse(wsMetrics, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4",
      },
    });
  } catch (error) {
    console.error("Failed to fetch metrics from WS server:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
