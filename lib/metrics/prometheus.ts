import { Registry, Counter, Histogram, Gauge } from "prom-client";

export const registry = new Registry();

export const llmRequestsTotal = new Counter({
  name: "llm_requests_total",
  help: "Total LLM requests",
  labelNames: ["model", "provider", "status"],
  registers: [registry],
});

export const llmLatencyMs = new Histogram({
  name: "llm_latency_ms",
  help: "LLM response latency in milliseconds",
  labelNames: ["model"],
  buckets: [100, 500, 1000, 3000, 5000],
  registers: [registry],
});

export const wsConnectionsActive = new Gauge({
  name: "ws_connections_active",
  help: "Active WebSocket connections",
  registers: [registry],
});
