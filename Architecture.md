<![CDATA[# Architecture Notes — TaskFlow AI

Technical architecture documentation covering system design, data flows, operational characteristics, and engineering decisions.

---

## 1. System Architecture

### Service Topology

TaskFlow runs as three cooperating processes with shared persistence:

| Process | Runtime | Port | Responsibility |
|---|---|---|---|
| **Next.js App** | Bun + Next.js 16 | 3000 | React frontend, REST API, metrics aggregation |
| **WebSocket Server** | Bun.serve() | 8080 | Real-time AI orchestration, session management, message persistence |
| **Worker** | Bun + BullMQ | — | Async inference log processing with PII redaction |

### Service Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                            │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  React 19 + @assistant-ui/react                             │   │
│  │  ┌───────────────┐  ┌──────────────┐  ┌───────────────────┐ │   │
│  │  │ Thread         │  │ Sidebar      │  │ Zustand Store     │ │   │
│  │  │ (messages,     │  │ (conv list,  │  │ (conversations,   │ │   │
│  │  │  typing, etc.) │  │  model pick) │  │  activeId, state) │ │   │
│  │  └───────────────┘  └──────────────┘  └───────────────────┘ │   │
│  │              │                │                │              │   │
│  │              └───── useWebSocketChat ──────────┘              │   │
│  └─────────────────────────┬───────────────────┬────────────────┘   │
│                            │ WS :8080          │ HTTP :3000         │
└────────────────────────────┼───────────────────┼────────────────────┘
                             │                   │
                 ┌───────────▼────────┐  ┌───────▼──────────────┐
                 │  WebSocket Server   │  │   Next.js API        │
                 │                     │  │                      │
                 │  Session Map        │  │ /api/conversations   │
                 │  ┌───────────────┐  │  │ /api/conversations/  │
                 │  │ ws → Session  │  │  │   [id]               │
                 │  │  • history    │  │  │ /api/ingest          │
                 │  │  • abort ctrl │  │  │ /api/metrics         │
                 │  │  • idle timer │  │  │                      │
                 │  │  • typing     │  │  └──────┬───────────────┘
                 │  │  • genId      │  │         │
                 │  └───────────────┘  │         │ POST /api/ingest
                 │                     │         │ (fire-and-forget)
                 │  streamText()       │         ▼
                 │  withLogger() ──────┼────► BullMQ Queue
                 │                     │         │
                 └──────┬──────────────┘         │
                        │                        ▼
                        │                 ┌──────────────┐
                        │                 │   Worker      │
                        │                 │               │
                        │                 │  PII redact() │
                        ▼                 │  insert log   │
                 ┌──────────────┐         └───────┬──────┘
                 │  PostgreSQL   │◄────────────────┘
                 │               │
                 │  conversations│
                 │  messages     │
                 │  inference_   │
                 │    logs       │
                 └──────────────┘

                 ┌──────────────┐
                 │    Redis      │
                 │               │
                 │  • BullMQ     │  (job queue for ingest worker)
                 │  • Pub/Sub    │  (cancel-session, typing-events)
                 └──────────────┘
```

### Event-Driven Architecture

The system uses two distinct event channels:

1. **WebSocket events** — Bidirectional, connection-scoped. All real-time UI state (tokens, typing indicators, errors) flows through the WebSocket. Events are JSON-encoded with a `type` discriminator.

2. **Redis Pub/Sub** — Broadcast, cross-process. Used for two channels:
   - `cancel-session` — The REST API can cancel a conversation by publishing its ID. All WebSocket server instances scan their session maps and abort matching sessions.
   - `typing-events` — The WebSocket server publishes `ai_started_typing`, `ai_completed`, and `ai_interrupted` events. These are currently informational but provide the hook for multi-client synchronization.

### Request Lifecycle

A complete user message lifecycle:

```
1. Client sends:      { type: "user_message", text: "..." }
                              │
2. Server parses:     JSON.parse() → validate type + text
                              │
3. Session update:    Clear typing nudge timer
                      Reset idle timer (phase → 0)
                              │
4. Interruption?      If session.isStreaming:
                        • Abort current generation
                        • Capture lastInterruption metadata
                        • Persist partial response (status: "interrupted")
                        • Send ai_interrupted event
                        • 60ms settle delay
                              │
5. History push:      session.history.push({ role: "user", content: text })
                              │
6. DB persist:        insertMessage({ conversationId, role: "user", content })
                      (fire-and-forget)
                              │
7. Title update:      If first user message:
                        updateConversationTitle(id, text.substring(0, 80))
                        Send title_updated event
                              │
8. AI generation:     streamAIResponse(session, ws)
                              │
     8a. Context:     buildContextWindow(history)  → last 20 messages
                      buildInterruptionContext()    → if was interrupted
                      warnIfOverBudget()            → log if >8000 est. tokens
                              │
     8b. Stream:      streamText({ model, system, messages, abortSignal })
                      (wrapped in withLogger for telemetry)
                              │
     8c. Delivery:    for await (chunk of textStream):
                        • Check generationId (stale guard)
                        • Check abortSignal
                        • Accumulate partialResponse
                        • Send ai_token event
                        • await sleep(computeTokenDelay(chunk))
                              │
     8d. Complete:    Send ai_done with tokensUsed
                      Push assistant message to history
                      insertMessage(status: "completed")
                      Publish ai_completed via Redis
                              │
     8e. Error:       classifyAIError(err)
                      Send ai_error with code + userMessage
                              │
     8f. Finally:     Reset isStreaming, abortController
                      Reset idle timer (unless in phase 2)
                              │
9. Telemetry:         withLogger sends POST /api/ingest
                      → IngestPayloadSchema validation
                      → enqueueLog() → BullMQ
                      → Worker dequeues
                      → redact(inputPreview), redact(outputPreview)
                      → insertInferenceLog()
```

---

## 2. Ingestion Flow

### How User Messages Enter the System

```
Browser → WebSocket (raw JSON string)
       → Bun.serve websocket.message handler
       → JSON.parse (with try/catch — invalid JSON is silently dropped)
       → Type discrimination (switch on data.type)
       → Only "user_message" with non-empty text proceeds
```

There is no HTTP-based message submission. All user messages flow exclusively through the WebSocket connection. The REST API handles only conversation listing, retrieval, deletion, and telemetry ingestion.

### WebSocket → Orchestration → AI → Persistence Flow

```
┌──────────┐     ┌──────────────────┐     ┌───────────────┐     ┌──────────┐
│ WebSocket │────►│  Session Manager  │────►│  AI SDK       │────►│ Postgres │
│ Message   │     │                  │     │  streamText() │     │          │
│           │     │  • History mgmt  │     │               │     │ messages │
│           │     │  • Interruption  │     │  OpenRouter    │     │          │
│           │     │  • Generation ID │     │  ↓             │     │          │
│           │     │  • Context build │     │  Token stream  │     │          │
└──────────┘     └──────────────────┘     └───────────────┘     └──────────┘
                                                │
                                          ┌─────▼─────┐
                                          │ withLogger │
                                          │ (Proxy)    │
                                          └─────┬─────┘
                                                │ POST /api/ingest
                                          ┌─────▼─────────┐
                                          │  BullMQ Queue  │
                                          └─────┬─────────┘
                                                │
                                          ┌─────▼─────────┐
                                          │  Worker        │
                                          │  • PII redact  │
                                          │  • DB insert   │
                                          └───────────────┘
```

### Event Propagation

Events flow in a strict pipeline:

1. **Inbound**: WebSocket message → session handler → business logic
2. **Outbound**: Business logic → `send(ws, payload)` → WebSocket → client
3. **Cross-process**: Business logic → `redisPub.publish(channel, JSON)` → all subscribers

Redis Pub/Sub is one-way fire-and-forget. The publisher does not wait for or expect acknowledgment.

### Streaming Lifecycle

```
State: IDLE
  │
  ├─ user_message arrives
  │
  ▼
State: GENERATING
  │  session.isStreaming = true
  │  session.generationId++
  │  session.abortController = new AbortController()
  │  
  │  → ai_start event
  │  → streamText() call
  │  
  │  for each token:
  │    → ai_token event
  │    → sleep(computeTokenDelay)
  │  
  ├─ Stream completes normally
  │    → ai_done event
  │    → session.isStreaming = false
  │    → State: IDLE
  │
  ├─ User sends cancel
  │    → abortController.abort()
  │    → persist partial (status: "interrupted")
  │    → ai_interrupted event
  │    → State: IDLE
  │
  ├─ User sends new message (interruption)
  │    → abortController.abort()
  │    → capture lastInterruption
  │    → persist partial (status: "interrupted")
  │    → ai_interrupted event
  │    → 60ms settle
  │    → Push user message to history
  │    → State: GENERATING (new generationId)
  │
  └─ Error from AI provider
       → classifyAIError()
       → ai_error event
       → session.isStreaming = false
       → State: IDLE
```

---

## 3. Logging Strategy

### Layers

| Layer | Mechanism | Destination | Purpose |
|---|---|---|---|
| **Console** | `console.log/warn/error` with `[tag]` prefix | stdout | Operational debugging, connection tracking |
| **Inference Logs** | `withLogger()` → BullMQ → Worker | `inference_logs` table | Analytical: model performance, cost, error rates |
| **Prometheus** | `prom-client` counters/histograms/gauges | `/api/metrics` endpoint | Real-time monitoring and alerting |
| **Grafana** | Pre-provisioned dashboards | `:3001` | Visual observability |

### Structured Console Logging

Console logs use tag prefixes for filterability:

```
[ws] client connected
[ws] Created conversation abc-123 with model openai/gpt-4o-mini
[ws] Idle phase 1 — sending nudge for abc-123
[ws] AI error [RATE_LIMITED]: ...
[token-guard] Estimated 9200 tokens (threshold: 8000)
[Ingest API] Failed to enqueue log: ...
```

**Design decision**: Plain `console.*` with tag prefixes was chosen over structured JSON logging (e.g., `pino`) for simplicity. In production, these would be replaced with a structured logger that outputs JSON for log aggregation systems.

### Inference Log Pipeline

```
streamText() call
  │
  └─► withLogger() wraps the call
        │
        ├─ Creates a Proxy around the result object
        │  └─ Intercepts textStream getter
        │     └─ Wraps the async iterator
        │        ├─ On each token: accumulate fullText
        │        ├─ On stream end: report("success", { outputPreview: fullText })
        │        └─ On error: report("error", { error: err.message })
        │
        └─ report() does two things:
             │
             ├─ 1. Prometheus metrics
             │     llmRequestsTotal.inc({ model, provider, status })
             │     llmLatencyMs.observe({ model }, latencyMs)
             │
             └─ 2. HTTP POST to /api/ingest
                   │
                   ├─ Zod validation (IngestPayloadSchema)
                   │
                   └─ enqueueLog(payload)
                        │
                        └─ BullMQ job added to "ingest" queue
                             │  attempts: 3
                             │  backoff: exponential, 1s base
                             │
                             └─ Worker.process()
                                  │
                                  ├─ Zod validation (again)
                                  ├─ redact(inputPreview)
                                  ├─ redact(outputPreview)
                                  └─ insertInferenceLog()
```

**Why validate twice?** The API route validates the payload before enqueueing to reject malformed requests immediately. The worker validates again as a defense-in-depth measure — the queue could theoretically contain jobs from other producers or corrupted data.

### Error Tracking

Errors are classified at two levels:

1. **AI errors** — `classifyAIError()` maps provider error messages to standardized codes. The `shouldLog` flag controls whether the error is logged to console (abort errors are silently ignored; all others are logged).

2. **Infrastructure errors** — DB write failures, Redis publish failures, and queue enqueue failures are caught individually and logged with context. None of these error paths crash the process.

### Debugging Workflow

For a typical debugging session:

1. **Identify the conversation**: Find the `conversationId` in WebSocket server logs.
2. **Check inference logs**: Query `inference_logs` for that conversation to see model calls, latencies, and errors.
3. **Check Prometheus**: Look at `llm_requests_total{status="error"}` to see error rates by model.
4. **Check Grafana**: Use the pre-built dashboard to visualize latency distributions and connection counts.
5. **Check worker logs**: If inference logs aren't appearing, check the worker's stdout for job processing errors.

---

## 4. Scaling Considerations

### WebSocket Scaling

**Current state**: Single Bun process handles all WebSocket connections. Bun's event loop is highly efficient for I/O-bound workloads (WebSocket framing, Redis pub/sub, DB queries). The actual bottleneck is LLM inference latency (~1-5 seconds per request to OpenRouter).

**Estimated capacity**: A single Bun process can sustain ~5,000-10,000 concurrent idle WebSocket connections. Active streaming connections are more expensive due to per-token `sleep()` calls and AI SDK overhead, but since each stream runs in the event loop (not a thread), the limit is primarily memory for session objects and backpressure from the AI provider.

**Scaling strategy**:

```
Layer 1: Sticky load balancer (HAProxy/Nginx)
  │
  ├─ WS Server 1 (Bun) ─── Redis ─── PostgreSQL
  ├─ WS Server 2 (Bun) ───┘       └──┘
  └─ WS Server N (Bun)
```

- **Sticky sessions** — WebSocket connections are long-lived and stateful. The load balancer must pin a client to the same backend for the connection's lifetime. IP hash or cookie-based affinity works.
- **Redis session registry** — On connection open, register `{ conversationId → serverId }` in Redis. On `cancel-session` Pub/Sub, only the owning server processes the cancellation (currently, all servers scan their session maps, which is O(n) per server but still fast).
- **Shared-nothing session state** — Each server owns its sessions entirely. If a server dies, those sessions are lost. Clients reconnect to a potentially different server, which creates a new session and rehydrates history from PostgreSQL.

### Redis Pub/Sub Usage

Currently two channels:

| Channel | Publisher | Subscriber | Purpose |
|---|---|---|---|
| `cancel-session` | REST API (`DELETE /api/conversations/:id`) | WebSocket server(s) | Cross-process session cancellation |
| `typing-events` | WebSocket server | (Currently unused by consumers) | Event bus for multi-client typing state |

**Scaling considerations**:
- Pub/Sub messages are broadcast to all subscribers. With N WebSocket servers, each cancel event is processed N times (but only the server with the matching session acts on it). This is acceptable for moderate N (~10-50 servers).
- For very large deployments, replace broadcast with targeted messaging using Redis Streams with consumer groups, or a dedicated service mesh.

### Horizontal Scaling: What Works Today

| Component | Horizontally Scalable? | Notes |
|---|---|---|
| **BullMQ Worker** | ✅ Yes | Multiple workers compete for jobs. BullMQ handles locking. |
| **Next.js API** | ✅ Yes | Stateless HTTP handlers. Standard load balancing. |
| **PostgreSQL** | ⚠️ Read replicas only | Write-heavy patterns (message inserts) need connection pooling. |
| **WebSocket Server** | ⚠️ With sticky sessions | Requires load balancer config + session registry. |

### Distributed-Safe Architecture

The current design is already partially distributed-safe:

- **No shared mutable state** between processes — Each WebSocket server owns its session map independently.
- **Idempotent DB writes** — UUID primary keys generated client-side (via `defaultRandom()`) prevent duplicate inserts.
- **Fire-and-forget persistence** — Message writes don't block the response stream, so a slow DB doesn't create backpressure on the WebSocket.
- **Redis Pub/Sub** — Already supports multi-subscriber broadcast.

### Worker Orchestration

```
┌──────────────────────────────────────────────┐
│                Redis (BullMQ)                │
│                                              │
│  Queue: "ingest"                             │
│  ┌──────┬──────┬──────┬──────┬──────┐       │
│  │ job1 │ job2 │ job3 │ job4 │ job5 │ ...   │
│  └──┬───┴──┬───┴──┬───┴──────┴──────┘       │
│     │      │      │                          │
└─────┼──────┼──────┼──────────────────────────┘
      │      │      │
      ▼      ▼      ▼
   Worker  Worker  Worker
     1       2       3
```

BullMQ guarantees:
- **At-least-once delivery** — Jobs are retried up to 3 times with exponential backoff (1s, 2s, 4s).
- **No duplicate processing** — Jobs are locked during processing. If a worker crashes, the lock expires and another worker picks up the job.
- **Ordered processing** — Not guaranteed across workers, but inference logs are timestamped at creation, so insertion order doesn't affect correctness.

---

## 5. Failure Handling Assumptions

### WebSocket Disconnects

**Assumption**: Disconnects are common and expected (browser tab close, network interruption, device sleep).

**Handling**:
1. `close` handler clears all timers and aborts any in-progress generation.
2. `ws_connections_active` gauge is decremented.
3. Session is deleted from the in-memory map.
4. No cleanup of the PostgreSQL conversation record — the conversation remains in its last status (`active`, `completed`, etc.).

**What's NOT handled**:
- Automatic reconnection from the server side.
- Notification to the client that the server is about to restart.
- Graceful draining of connections before server shutdown.

**Recovery path**: The client opens a new WebSocket with `?conversationId=<id>` to resume. The server rehydrates history from PostgreSQL and starts the idle timer.

### AI Provider Failures

**Assumption**: OpenRouter and upstream providers (OpenAI, Google, DeepSeek, Meta) will fail intermittently with various error types.

**Handling**:
- All errors pass through `classifyAIError()`, which maps raw error messages to user-friendly codes.
- Abort errors (from intentional cancellation) are silently ignored.
- All other errors are sent to the client as `ai_error` events with both a machine-readable `code` and a `userMessage`.
- The `shouldLog` flag ensures operational errors are logged while expected aborts are not.

**What's NOT handled**:
- Automatic retry of failed generations (user must re-send their message).
- Fallback to a secondary model when the primary is unavailable.
- Circuit breaking to prevent repeated calls to a degraded provider.

### Interrupted Generations

**Assumption**: Users will frequently send messages while the AI is mid-response.

**Handling**:
1. The current `AbortController` is aborted, which cancels the `streamText()` network request.
2. The partial response is persisted with `status: "interrupted"`.
3. `lastInterruption` metadata is captured (partial content, token count, user's interrupting message).
4. A 60ms `sleep()` ensures the abort has fully propagated before the interruption event is sent.
5. On the next generation, `buildInterruptionContext()` injects a system message that tells the AI what it had said, where it was cut off, and what the user said.

**Race condition prevention**: Each generation is assigned a monotonically increasing `generationId`. The streaming loop checks `session.generationId !== thisGenerationId` on every token iteration. If a new generation has started, the old loop exits without side effects.

### Redis Outages

**Assumption**: Redis should be treated as a soft dependency for the WebSocket server.

**Handling**:
- Pub/Sub publish calls use `.catch(() => {})` — failures are silently swallowed. The system degrades to single-server operation (no cross-process cancellation or typing events).
- BullMQ connections use `maxRetriesPerRequest: null`, which means ioredis will retry indefinitely rather than throwing after a fixed count.
- The `/api/ingest` route returns `200` even if enqueue fails — the failure is logged but doesn't block the HTTP response.

**What's NOT handled**:
- Queue draining or job recovery after extended Redis outage.
- Alerting on Redis connection state.

### Duplicate Events

**Assumption**: WebSocket delivery is reliable (TCP guarantees ordering and delivery within a connection). Redis Pub/Sub is at-most-once (no delivery guarantee, no duplicate guarantee).

**Handling**:
- WebSocket events are not deduplicated — the TCP connection guarantees exactly-once delivery.
- BullMQ jobs are deduplicated by the queue's locking mechanism. If a worker crashes mid-processing, the job is retried (at-least-once semantics). The `insertInferenceLog` call generates a new UUID, so a retry creates a new log entry. This is acceptable for telemetry data where slight overcounting is preferable to data loss.

### Partial Persistence

**Assumption**: It's better to persist a partial AI response than to lose it entirely.

When a generation is interrupted (by user message or explicit cancel):
1. `session.partialResponse` (all tokens received so far) is persisted as a message with `status: "interrupted"`.
2. The partial text is added to `session.history` so it's available as context for the next generation.
3. On the frontend, messages with `interrupted` status display an "Interrupted" badge.

This means the database always reflects what the user actually saw, even if the AI didn't finish its thought.

### Eventual Consistency

**Sources of inconsistency**:

1. **Sidebar vs. DB** — The conversation list is loaded once on mount and updated via WebSocket events. If a conversation is modified by another client/process, the sidebar won't reflect it until refresh.
2. **In-memory history vs. DB** — The WebSocket server's session history is the source of truth during an active session. The DB is eventually consistent after fire-and-forget writes.
3. **Inference logs** — There's a delay between the AI call completing and the inference log being written to the DB (passes through BullMQ queue and worker).

All of these are acceptable for a single-user system. Multi-user or multi-device scenarios would need stronger consistency guarantees.

---

## 6. Event Flow Documentation

### WebSocket Event Lifecycle

#### New Conversation

```
Client                    Server                         DB
  │                         │                             │
  │─── WS connect ─────────►│                             │
  │                         ├─ createConversation() ─────►│
  │◄── conversation_created │                             │
  │◄── ai_start ────────────│                             │
  │◄── ai_token (×N) ──────│                             │
  │◄── ai_done ─────────────│── insertMessage(greeting) ─►│
  │                         │                             │
```

#### User Message (Normal Flow)

```
Client                    Server                         DB
  │                         │                             │
  │─── user_typing ────────►│ reset idle timer            │
  │─── user_typing ────────►│ (throttled: 300ms debounce) │
  │─── user_stopped_typing ►│ clear typing nudge          │
  │─── user_message ───────►│                             │
  │                         ├─ insertMessage(user) ──────►│
  │                         ├─ updateConversationTitle() ─►│ (first msg only)
  │◄── title_updated ──────│                             │
  │◄── ai_start ────────────│                             │
  │◄── ai_token (×N) ──────│                             │
  │◄── ai_done ─────────────│── insertMessage(assistant) ►│
  │                         │                             │
```

#### Interruption Flow

```
Client                    Server                         DB
  │                         │                             │
  │◄── ai_token (×N) ──────│ streaming in progress       │
  │                         │                             │
  │─── user_message ───────►│                             │
  │                         ├─ abort current stream        │
  │                         ├─ capture lastInterruption    │
  │                         ├─ insertMessage(interrupted) ►│
  │◄── ai_interrupted ─────│                             │
  │                         │ [60ms settle]               │
  │                         ├─ push user msg to history    │
  │                         ├─ insertMessage(user) ──────►│
  │◄── ai_start ────────────│ (with interruption context) │
  │◄── ai_token (×N) ──────│                             │
  │◄── ai_done ─────────────│── insertMessage(assistant) ►│
  │                         │                             │
```

#### Idle Timeout Flow

```
Client                    Server
  │                         │
  │                         │ [15s no activity]
  │                         ├─ idlePhase = 1
  │◄── ai_start ────────────│
  │◄── ai_token (×N) ──────│ "Still there?"
  │◄── ai_done ─────────────│
  │                         │
  │                         │ [15s still no activity]
  │                         ├─ idlePhase = 2
  │                         ├─ updateConversationStatus("completed")
  │◄── conversation_ended ──│
  │                         │
```

### Typing Events

```
                    Debounced Typing Pipeline

User keystroke
     │
     ▼
notifyTyping() called
     │
     ├─ First call: isTypingSentRef = false
     │   └─ Send { type: "user_typing" } over WS
     │      Set isTypingSentRef = true
     │      Store sets isUserTyping = true
     │
     ├─ Subsequent calls (within 2s):
     │   └─ Only reset the 2s stop timer
     │
     └─ After 2s of no keystrokes:
         └─ Timer fires
            Send { type: "user_stopped_typing" } over WS
            Set isTypingSentRef = false
            Store sets isUserTyping = false
```

Server-side typing handling:
- `user_typing`: Throttled (300ms minimum interval). Starts the 30s typing nudge timer. Resets the idle timer.
- `user_stopped_typing`: Clears the typing nudge timer. Resets `typingNudgeSent` flag.
- On `user_message`: Clears all typing state and timers.

### AI Streaming Events

```
ai_start
  │
  │  AI is "thinking" — typing indicator visible
  │
  ├─ First ai_token arrives
  │    Transition: typing indicator → streaming indicator
  │
  ├─ ai_token (repeated)
  │    Each token appended to message content
  │    Humanized delay between tokens
  │
  └─ Terminal event (one of):
       ├─ ai_done          → stream completed normally
       ├─ ai_interrupted   → stream aborted by user
       └─ ai_error         → stream failed
```

---

## 7. Concurrency & Interruption Handling

### Cancellation Architecture

The system uses a cooperative cancellation model based on `AbortController`:

```typescript
session.abortController = new AbortController();

// Passed to the AI SDK:
streamText({ ..., abortSignal: session.abortController.signal });

// To cancel:
session.abortController.abort();
```

The `AbortController` is threaded through three layers:
1. **AI SDK** — `streamText()` accepts an `abortSignal` and cancels the underlying HTTP request to OpenRouter when signaled.
2. **Token delivery loop** — Checks `session.abortController.signal.aborted` on every iteration.
3. **Error handler** — `classifyAIError()` recognizes `AbortError` and returns `{ code: "ABORT", shouldLog: false }`, preventing abort-related noise in logs.

### Race Condition Prevention

**Problem**: Between aborting the old generation and starting a new one, there's a window where both could be running, causing interleaved token delivery.

**Solution: Generation ID fencing**

```typescript
session.generationId++;  // Monotonically increasing
const thisGenerationId = session.generationId;

// In the streaming loop:
for await (const chunk of result.textStream) {
    if (session.generationId !== thisGenerationId) break;  // Stale — exit
    if (session.abortController.signal.aborted) break;     // Cancelled — exit
    // ... deliver token
}

// In the finally block:
if (session.generationId === thisGenerationId) {
    // Only the current generation cleans up session state
    session.isStreaming = false;
    session.abortController = null;
}
```

This ensures:
- A stale generation's loop exits without side effects.
- Only the current generation modifies shared session state (isStreaming, abortController).
- Timer resets in the `finally` block only fire for the active generation.

### Stream Lifecycle Management

```
Session State Machine:

                 ┌──────────────────────────────────────────┐
                 │                                          │
                 ▼                                          │
           ┌──────────┐    streamAIResponse()    ┌──────────┤
           │   IDLE    │ ───────────────────────► │ STREAMING│
           │           │                          │          │
           │ isStream: │                          │ isStream:│
           │  false    │ ◄─────────────────────── │  true    │
           │           │    stream completes      │          │
           └──────────┘    or aborts              └──────────┘
                │                                      │
                │  idlePhase 2                        │
                │  (after two                         │
                │   timeouts)                         │
                ▼                                      │
           ┌──────────┐                               │
           │ TERMINATED│  conversation_ended sent      │
           │           │  No further messages accepted  │
           │ idlePhase:│                               │
           │  2        │ ◄─────────────────────────────┘
           └──────────┘     idlePhase 2 while streaming
```

Key invariants:
- `session.isStreaming === true` ⟹ `session.abortController !== null`
- `session.idlePhase === 2` ⟹ no new messages are processed (early return in message handler)
- `session.generationId` is monotonically increasing and never reset

### Interruption-Aware Response Generation

When the user interrupts:

```
1. Abort current generation
2. Capture interruption metadata:
   {
     partialContent: session.partialResponse,      // What AI said so far
     interruptedAtToken: session.tokenCount,        // How many tokens were delivered
     userMessage: data.text                         // What the user said
   }

3. Store as session.lastInterruption

4. On next streamAIResponse():
   • analyzeInterruption(partialContent) splits into:
     - completedSentences: "I can help you with that."
     - interruptedSentence: "Let me start by"

   • buildInterruptionContext() creates a system message:
     "[INTERRUPTION CONTEXT] You were speaking but the user interrupted you.
      You had fully said: 'I can help you with that.'
      You were in the middle of saying: 'Let me start by' when you were cut off.
      The user interrupted with: 'Actually, do X instead.'
      Please respond naturally from where you were cut off..."

   • This system message is appended to the context window
   • session.lastInterruption is cleared (consumed once)
```

This approach ensures:
- The AI doesn't repeat what it already said.
- The AI acknowledges the interruption naturally.
- The conversational thread isn't broken by the interruption.
- The system message is injected only once (next generation after interruption), not permanently.

---

*This document covers the core architectural decisions and system behavior of TaskFlow AI. For setup instructions and API documentation, see [README.md](./README.md).*
]]>
