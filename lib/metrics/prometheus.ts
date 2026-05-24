import { Registry, Counter, Histogram, Gauge } from "prom-client";

export const registry = new Registry();

// ── Core LLM Metrics ────────────────────────────────────────────

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
  buckets: [100, 500, 1000, 3000, 5000, 10000],
  registers: [registry],
});

// ── Error Breakdown ─────────────────────────────────────────────

export const llmErrorsByType = new Counter({
  name: "llm_errors_by_type_total",
  help: "LLM errors broken down by classified error code",
  labelNames: ["model", "provider", "error_code"],
  registers: [registry],
});

// ── Stream & Conversation Lifecycle ─────────────────────────────

export const streamInterruptions = new Counter({
  name: "stream_interruptions_total",
  help: "Number of AI streams interrupted by user or cancellation",
  labelNames: ["model"],
  registers: [registry],
});

export const conversationLifecycle = new Counter({
  name: "conversation_lifecycle_total",
  help: "Conversation lifecycle events",
  labelNames: ["action"],
  registers: [registry],
});

// ── WebSocket Connections ───────────────────────────────────────

export const wsConnectionsActive = new Gauge({
  name: "ws_connections_active",
  help: "Active WebSocket connections",
  registers: [registry],
});

export const wsConnectionEvents = new Counter({
  name: "ws_connection_events_total",
  help: "WebSocket connection lifecycle events",
  labelNames: ["event"],
  registers: [registry],
});
