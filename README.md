<![CDATA[# TaskFlow AI

A real-time conversational AI platform built on WebSocket streaming, designed for low-latency multi-model inference with full conversation persistence, interruption-aware response generation, and production-grade observability.

TaskFlow orchestrates conversations between users and large language models through a custom WebSocket server that streams tokens with humanized delivery timing, supports mid-stream interruptions, and persists every exchange to PostgreSQL. An asynchronous worker pipeline processes inference telemetry through Redis-backed BullMQ queues, while Prometheus and Grafana provide real-time system visibility.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Setup Instructions](#setup-instructions)
- [Database & Schema Design](#database--schema-design)
- [Tradeoffs Made](#tradeoffs-made)
- [Failure Handling](#failure-handling)
- [Scaling Considerations](#scaling-considerations)
- [Observability & Logging](#observability--logging)
- [Token Optimization Strategy](#token-optimization-strategy)
- [API & WebSocket Documentation](#api--websocket-documentation)
- [Folder Structure](#folder-structure)
- [Future Improvements](#future-improvements)

---

## Features

### Core Conversational AI
- **Multi-model selection** — Switch between models from OpenAI, Google, DeepSeek, and Meta via OpenRouter. Model choice is persisted per conversation.
- **WebSocket streaming** — Token-by-token delivery with humanized timing: longer pauses at sentence boundaries (`.!?`), medium pauses at clause breaks (`,;:`), and slight jitter for natural cadence.
- **Interruption handling** — Users can send a new message while the AI is mid-response. The system aborts the current generation, analyzes where the response was interrupted (complete vs. partial sentences), and injects interruption context into the next prompt so the AI responds naturally from the cutoff point.
- **Streaming cancellation** — Users can explicitly cancel an in-progress generation. Partial responses are persisted with `interrupted` status.

### Conversation Management
- **Conversation persistence** — Every conversation and message is stored in PostgreSQL with full lifecycle tracking (`active`, `completed`, `cancelled`).
- **Conversation resumption** — Reconnecting to an existing conversation rehydrates the in-memory history from the database and resumes the idle timer.
- **Chat history sidebar** — A Zustand-powered store hydrated from the REST API on mount. Conversations are listed with title, preview, and message count.
- **Auto-titling** — The first user message becomes the conversation title (truncated to 80 characters).

### Engagement & UX
- **Typing indicators** — Debounced `user_typing` / `user_stopped_typing` events are sent over the WebSocket. The server tracks typing state per session.
- **AI typing indicator** — A visual indicator appears between `ai_start` and the first `ai_token`, then transitions to a streaming indicator.
- **Idle detection** — Two-phase idle system:
  - **Phase 1** (15s): The AI sends a gentle nudge ("Still there?").
  - **Phase 2** (15s after phase 1): Conversation is marked `completed` and the client receives a `conversation_ended` event.
- **Typing nudge** — If the user is typing for >30 seconds without sending, the AI sends an encouraging message ("Take your time — I'm here.").
- **Message timestamps** — Every message displays its creation time in the UI.
- **Interrupted badge** — Messages cut off by interruption display a visual "Interrupted" indicator.

### Observability
- **Prometheus metrics** — `llm_requests_total` (counter), `llm_latency_ms` (histogram), `ws_connections_active` (gauge).
- **Inference logging** — Every LLM call is logged with model, provider, latency, token counts, input/output previews, and error details.
- **PII redaction** — Credit cards, Aadhaar numbers, PAN cards, emails, and phone numbers are automatically scrubbed from inference logs before persistence.
- **Grafana dashboards** — Pre-provisioned dashboard and datasource configuration for immediate visibility.

### Infrastructure
- **BullMQ worker pipeline** — Inference logs are enqueued via the Next.js API and processed asynchronously by a dedicated Bun worker with exponential backoff retry (3 attempts).
- **Redis Pub/Sub** — Cross-process event system for session cancellation (`cancel-session`) and typing coordination (`typing-events`).
- **Docker Compose** — Single-command deployment of all services: app, worker, PostgreSQL, Redis, Prometheus, and Grafana.
- **Multi-stage Docker builds** — Separate `Dockerfile` (app) and `Dockerfile.worker` optimized for minimal image size.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 (Turbopack), React 19, `@assistant-ui/react`, Zustand, Radix UI, Tailwind CSS 4 |
| **Backend (API)** | Next.js API Routes (App Router) |
| **WebSocket Server** | Bun native `Bun.serve()` WebSocket server |
| **AI Orchestration** | Vercel AI SDK (`ai`), `@ai-sdk/openai` adapter |
| **AI Provider** | OpenRouter (proxies to OpenAI, Google, DeepSeek, Meta) |
| **Database** | PostgreSQL 16 with Drizzle ORM |
| **Queue** | BullMQ (Redis-backed job queue) |
| **Pub/Sub** | Redis 7 (`ioredis`) |
| **Metrics** | `prom-client` (Prometheus client) |
| **Monitoring** | Prometheus 2.53 + Grafana 11.1 |
| **Validation** | Zod 4 |
| **Linting** | Biome |
| **Runtime** | Bun 1.3 |
| **Containerization** | Docker, Docker Compose |

---

## Architecture Overview

TaskFlow runs as three independent processes sharing PostgreSQL and Redis:

```
┌──────────────────────────────────────────────────────────────────┐
│                         Client (Browser)                        │
│  React 19 + @assistant-ui/react + Zustand conversation store    │
└──────────┬────────────────────┬──────────────────────────────────┘
           │ WebSocket :8080    │ HTTP :3000
           ▼                    ▼
┌────────────────────┐  ┌──────────────────────┐
│  WebSocket Server  │  │    Next.js App        │
│  (Bun.serve)       │  │    (API Routes)       │
│                    │  │                        │
│  • AI streaming    │  │  • /api/conversations  │
│  • Session mgmt    │  │  • /api/conversations/ │
│  • Idle detection  │  │    [id]                │
│  • Interruption    │  │  • /api/ingest         │
│  • Token delivery  │  │  • /api/metrics        │
│  • Persistence     │  │                        │
└──────┬───┬─────────┘  └──────┬───┬─────────────┘
       │   │                   │   │
       │   │  ┌────────────────┘   │
       │   │  │                    │
       ▼   ▼  ▼                    ▼
┌──────────────┐          ┌──────────────┐
│  PostgreSQL  │          │    Redis     │
│              │          │              │
│  • convs     │          │  • BullMQ    │
│  • messages  │          │  • Pub/Sub   │
│  • inf_logs  │          │  • Sessions  │
└──────────────┘          └──────┬───────┘
                                 │
                          ┌──────▼───────┐
                          │   Worker     │
                          │  (BullMQ)    │
                          │              │
                          │  • PII scrub │
                          │  • DB insert │
                          └──────────────┘

┌──────────────────────────────────────────┐
│           Observability Stack            │
│  Prometheus → scrapes /api/metrics       │
│  Grafana   → queries Prometheus          │
└──────────────────────────────────────────┘
```

### Process Boundaries

1. **Next.js App** (`:3000`) — Serves the React frontend, REST API routes, and aggregates Prometheus metrics from both itself and the WebSocket server.
2. **WebSocket Server** (`:8080`) — Bun-native server handling all real-time communication: connection lifecycle, AI model inference via the Vercel AI SDK, streaming with humanized delays, interruption analysis, idle detection, and message persistence.
3. **Worker** — A BullMQ consumer that dequeues inference log jobs, applies PII redaction, and writes telemetry to the `inference_logs` table.

### Request Lifecycle

1. Client opens WebSocket to `:8080` with `?model=<id>&conversationId=<uuid>`.
2. Server creates (or resumes) a session and conversation record.
3. For new conversations, the server immediately streams a greeting.
4. User messages arrive as `{ type: "user_message", text: "..." }`.
5. The server pushes the message to in-memory history, persists to PostgreSQL, and calls `streamText()`.
6. Tokens are delivered one-by-one with computed delays via `ai_token` events.
7. On completion, `ai_done` is sent with token usage. The assistant message is persisted.
8. Meanwhile, the `withLogger` wrapper fires inference telemetry to `/api/ingest`, which enqueues a BullMQ job.
9. The worker dequeues, applies PII redaction, and writes an `inference_logs` row.

---

## Setup Instructions

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) & Docker Compose (for infrastructure services)
- An [OpenRouter](https://openrouter.ai/) API key

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/taskflow-ai.git
cd taskflow-ai
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Configure Environment Variables

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

**`.env.local` structure:**

```env
# Required — OpenRouter API key for LLM inference
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxx

# Required — PostgreSQL connection string
DATABASE_URL=postgresql://taskflow:taskflow_secret@localhost:5432/taskflow

# Required — Redis connection string
REDIS_URL=redis://localhost:6379
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | Yes | Your OpenRouter API key. Obtain from [openrouter.ai/keys](https://openrouter.ai/keys). |
| `DATABASE_URL` | Yes | PostgreSQL connection URI. The Docker Compose default is `postgresql://taskflow:taskflow_secret@localhost:5432/taskflow`. |
| `REDIS_URL` | Yes | Redis connection URI. Defaults to `redis://localhost:6379`. |

### 4. Start Infrastructure Services

```bash
docker compose up postgres redis -d
```

This starts PostgreSQL 16 and Redis 7 with health checks. Wait for them to be healthy:

```bash
docker compose ps   # Both should show "healthy"
```

### 5. Run Database Migrations

```bash
bunx drizzle-kit push
```

This uses the Drizzle config at `drizzle.config.ts` which reads `DATABASE_URL` from `.env.local`.

### 6. Start the Application

**Development mode** (Next.js + WebSocket server concurrently):

```bash
bun run dev
```

This runs:
- `next dev --turbopack` on port `3000`
- `bun run server.ts` (WebSocket server) on port `8080`

**Start the worker** (separate terminal):

```bash
bun run worker
```

### 7. Start Observability Stack (Optional)

```bash
docker compose up prometheus grafana -d
```

- **Prometheus**: [http://localhost:9090](http://localhost:9090)
- **Grafana**: [http://localhost:3001](http://localhost:3001) (admin/admin)

### Docker Compose (Full Stack)

To run the entire stack (app, worker, postgres, redis, prometheus, grafana) in containers:

```bash
docker compose up --build
```

| Service | Port | Description |
|---|---|---|
| `app` | 3000, 8080 | Next.js + WebSocket server |
| `worker` | — | BullMQ inference log consumer |
| `postgres` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | Redis 7 |
| `prometheus` | 9090 | Metrics collection |
| `grafana` | 3001 | Dashboards |

---

## Database & Schema Design

### Tables

#### `conversations`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK, random) | Unique conversation identifier |
| `title` | TEXT | Auto-generated from first user message (max 80 chars) |
| `status` | TEXT | Lifecycle state: `active`, `completed`, `cancelled` |
| `model` | TEXT | OpenRouter model ID used for this conversation |
| `provider` | TEXT | AI provider name (e.g., `openrouter`) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last activity time |

#### `messages`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK, random) | Unique message identifier |
| `conversation_id` | UUID (FK → conversations, CASCADE) | Parent conversation |
| `role` | TEXT | `user`, `assistant`, or `system` |
| `content` | TEXT | Full message text |
| `status` | TEXT | `completed` or `interrupted` — tracks whether AI was cut off |
| `created_at` | TIMESTAMP | Message creation time |

#### `inference_logs`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK, random) | Unique log entry identifier |
| `conversation_id` | UUID (FK → conversations, CASCADE) | Associated conversation |
| `message_id` | UUID (FK → messages, SET NULL) | Associated message (nullable) |
| `model` | TEXT | Model identifier |
| `provider` | TEXT | Provider name |
| `latency_ms` | INTEGER | End-to-end inference latency |
| `input_tokens` | INTEGER | Prompt token count |
| `output_tokens` | INTEGER | Completion token count |
| `status` | TEXT | `success` or `error` |
| `error_message` | TEXT | Error details if status is `error` |
| `input_preview` | TEXT | PII-redacted input preview |
| `output_preview` | TEXT | PII-redacted output preview |
| `created_at` | TIMESTAMP | Log creation time |

### Design Decisions

**Why TEXT over ENUM for status fields?**
`TEXT` columns with application-level validation avoid migration friction when adding new states. Drizzle ORM validates at the query layer, and the tradeoff of slightly weaker DB-level guarantees is acceptable for iteration speed.

**Why CASCADE delete on messages but SET NULL on inference_logs.message_id?**
Deleting a conversation should purge all its messages (data ownership). Inference logs, however, are telemetry — if a specific message is deleted, the log retains its analytical value with a null reference.

**Why UUIDs over auto-increment?**
UUIDs support distributed ID generation without coordination. If the WebSocket server and API ever run in different processes or regions, there are no ID conflicts.

**Why a separate `inference_logs` table?**
Inference telemetry has a fundamentally different access pattern and lifecycle than conversation messages. Separating them allows independent indexing, retention policies, and query optimization. Inference logs are write-heavy and read via aggregation; messages are read-heavy and accessed per conversation.

**Why `status` on messages?**
The `interrupted` status is critical for conversation resumption. When the AI is interrupted mid-response, the partial text is persisted with `status: "interrupted"`. On the frontend, this drives the visual "Interrupted" badge and informs the context window builder about what the AI had already said.

### Scalability Considerations

- The `conversation_id` foreign key on `messages` enables efficient per-conversation queries. A B-tree index on `(conversation_id, created_at)` would further optimize message retrieval for conversations with many messages.
- `inference_logs` can be partitioned by `created_at` for time-series retention policies without affecting conversation data.
- `TEXT` content columns store full messages without length limits, which is appropriate for LLM outputs that vary from single words to multi-paragraph responses.

---

## Tradeoffs Made

### In-Memory Session State vs. Distributed State

**Decision**: Conversation sessions (history, abort controllers, idle timers, typing state) live in a `Map<WebSocket, Session>` on the WebSocket server process.

**Why**: WebSocket connections are inherently stateful and pinned to a single server. Storing session state in Redis would add latency to every token delivery and introduce serialization complexity for `AbortController` references and timer handles, which are fundamentally process-local constructs.

**Risk**: Sessions are lost on server restart. Mitigated by persisting all messages to PostgreSQL — conversation history is reconstructed on reconnect.

### Fire-and-Forget Persistence vs. Write-Ahead Logging

**Decision**: Message persistence is fire-and-forget (`insertMessage(...).catch(err => console.error(...))`).

**Why**: Blocking on DB writes during a streaming response would degrade perceived latency. The AI response is already in-memory and delivered to the client — the write-to-DB is a durability concern, not a correctness concern for the active session.

**Risk**: If PostgreSQL is down during a message write, that specific message is lost from the DB (though it was delivered to the client). The tradeoff favors UX responsiveness over strict durability guarantees.

### Single-Process WebSocket Server vs. Clustered Architecture

**Decision**: A single Bun process handles all WebSocket connections.

**Why**: Bun's event loop can handle thousands of concurrent connections efficiently. The bottleneck is LLM inference latency (seconds), not connection handling (microseconds). Adding a load balancer and sticky sessions adds operational complexity without improving the actual bottleneck.

**Risk**: Vertical scaling limit. Documented in [Scaling Considerations](#scaling-considerations).

### Humanized Token Delays vs. Raw Speed

**Decision**: Each token is delivered with a computed delay (30ms base + jitter, with extra pauses at punctuation and line breaks).

**Why**: Raw streaming feels mechanical and overwhelming. The delays create a conversational cadence that matches human speech patterns, significantly improving the UX of real-time AI chat.

**Cost**: ~2-5 seconds added to total response delivery time for a typical response. Acceptable for a conversational interface where perceived naturalness matters more than raw throughput.

### Sliding Window Context vs. Full History

**Decision**: The context window is capped at the last 20 messages (`MAX_CONTEXT_MESSAGES = 20`).

**Why**: LLM context windows have hard token limits. Sending the full history of a long conversation would either exceed the limit or consume excessive tokens. A sliding window is the simplest effective strategy.

**What's lost**: Early conversation context is dropped. No summarization or retrieval mechanism exists to recall earlier messages. See [Future Improvements](#future-improvements).

### Estimated Token Counting vs. Tokenizer

**Decision**: Token count is estimated at ~4 characters per token (`Math.ceil(charCount / 4)`).

**Why**: Running a real tokenizer (e.g., `tiktoken`) for every message on every request adds dependency weight and latency for marginal accuracy improvement. The estimate is used only for budget warnings, not hard limits.

### Eventual Consistency in Sidebar State

**Decision**: The sidebar conversation list is hydrated once on mount from the REST API, then updated optimistically via WebSocket events.

**Why**: Polling the API or subscribing to a change stream would add complexity for a single-user application. The eventual consistency window is negligible — the user sees their own actions reflected immediately via the Zustand store.

---

## Failure Handling

### WebSocket Disconnects

- On `close`, the server clears all timers (idle + typing nudge), aborts any in-progress generation, and deletes the session from the in-memory map.
- The active `ws_connections_active` gauge is decremented.
- No automatic reconnect is implemented server-side. The client can reconnect by opening a new WebSocket with the `conversationId` parameter to resume.

### AI Provider Failures

All errors from `streamText()` pass through `classifyAIError()`, which pattern-matches against known error signatures:

| Code | Pattern | User Message |
|---|---|---|
| `RATE_LIMITED` | `429`, `rate limit`, `RESOURCE_EXHAUSTED` | "You've exceeded the model's rate limit…" |
| `QUOTA_EXCEEDED` | `billing`, `payment`, `QUOTA_EXCEEDED` | "You've hit the usage quota…" |
| `MODEL_NOT_FOUND` | `model not found`, `does not exist` | "This model is not available…" |
| `PERMISSION_DENIED` | `api key`, `unauthorized`, `403` | "API key is invalid…" |
| `SERVICE_UNAVAILABLE` | `503`, `overloaded` | "The AI service is temporarily unavailable…" |
| `TIMEOUT` | `timeout`, `DEADLINE_EXCEEDED` | "The request timed out…" |
| `CONTENT_BLOCKED` | `safety`, `content filter` | "Response blocked by content safety filter…" |
| `ABORT` | `AbortError` | (Silent — no user message) |
| `UNKNOWN` | Everything else | "Something went wrong. Please try again." |

Classified errors are sent to the client as `ai_error` events with both a user-friendly message and a machine-readable code.

### Interruption Race Conditions

**Problem**: A user sends a message while the AI is streaming. Two things must happen atomically: (1) abort the current generation, (2) start a new one with interruption context.

**Solution**: Each generation is assigned a monotonically increasing `generationId`. The streaming loop checks `session.generationId !== thisGenerationId` on every token. If a new generation has started, the old loop exits silently. A 60ms `sleep()` after abort ensures the old stream has fully terminated before the client receives the `ai_interrupted` event.

### Redis/Pub/Sub Failures

- Pub/Sub publish calls use `.catch(() => {})` — failures are silently swallowed. Pub/Sub is used for cross-process coordination (cancellation, typing events), not for data integrity.
- BullMQ queue connections use `maxRetriesPerRequest: null` to prevent ioredis from throwing after a fixed retry count. The worker will reconnect indefinitely.
- If Redis is down, the ingest API still returns `200` — the enqueue failure is logged but doesn't block the HTTP response.

### Partial Stream Persistence

When a stream is interrupted (user sends a new message or explicitly cancels):
1. The partial response accumulated so far (`session.partialResponse`) is persisted to `messages` with `status: "interrupted"`.
2. The partial text is pushed to in-memory history so the AI has context for the next generation.
3. The `ai_interrupted` event includes the last 200 characters of partial content and the token count at interruption.

### Database Write Failures

All DB writes in the WebSocket server are fire-and-forget with error logging:

```typescript
insertMessage({...}).catch(err => console.error("[ws] Failed to persist:", err));
```

This means:
- A PostgreSQL outage does not crash the WebSocket server or disrupt active conversations.
- Messages delivered to the client are not lost from the user's perspective — only from the database.
- Conversation state in the sidebar may become stale if the initial `createConversation` fails.

---

## Scaling Considerations

### Current Architecture Bottlenecks

1. **Single WebSocket process** — All connections are handled by one Bun process. At ~10K concurrent connections, event loop saturation becomes likely depending on streaming concurrency.
2. **In-memory session store** — The `Map<WebSocket, Session>` is process-local. Horizontal scaling requires session migration or sticky routing.
3. **N+1 query in conversation listing** — `getConversationsWithStats()` issues a separate count and last-message query per conversation. This becomes expensive at >1000 conversations.

### Horizontal Scaling Path

```
                    ┌──────────────┐
                    │ Load Balancer │
                    │ (sticky WS)   │
                    └──┬────┬───┬──┘
                       │    │   │
              ┌────────┘    │   └────────┐
              ▼             ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  WS-1    │ │  WS-2    │ │  WS-3    │
        │ (Bun)    │ │ (Bun)    │ │ (Bun)    │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │             │            │
             └──────┬──────┘            │
                    ▼                   │
             ┌──────────┐              │
             │  Redis    │◄─────────────┘
             │  Pub/Sub  │
             └──────────┘
```

**What's already distributed-safe**:
- PostgreSQL writes — No process-local write coordination needed.
- Redis Pub/Sub — `cancel-session` events are broadcast to all WebSocket servers. The correct server handles the matching `conversationId`.
- BullMQ workers — Multiple worker replicas can consume from the `ingest` queue concurrently. BullMQ handles job locking.

**What would need work**:
- **Sticky sessions** — WebSocket connections must route to the same server for their lifetime. This requires a load balancer with cookie/IP-based affinity or a connection registry in Redis.
- **Metrics aggregation** — Each WebSocket server exposes its own `/metrics`. A Prometheus service discovery mechanism or a central aggregation endpoint would be needed.
- **Session recovery** — On server crash, in-flight sessions are lost. A Redis-backed session store (excluding non-serializable fields like `AbortController`) would enable recovery.

### Scaling the Worker

BullMQ workers scale horizontally by default. Each worker instance competes for jobs from the `ingest` queue. Adding replicas linearly increases throughput:

```bash
docker compose up --scale worker=4
```

### Database Scaling

- **Read replicas** — The conversation listing and message retrieval queries are read-heavy and can be routed to replicas.
- **Connection pooling** — The current `postgres` driver creates a connection pool per process. For multi-process deployments, an external pooler (PgBouncer) would prevent connection exhaustion.
- **Table partitioning** — `inference_logs` is a candidate for range partitioning by `created_at` for time-based retention and query performance.

---

## Observability & Logging

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `llm_requests_total` | Counter | `model`, `provider`, `status` | Total LLM inference requests |
| `llm_latency_ms` | Histogram | `model` | End-to-end inference latency distribution (buckets: 100, 500, 1000, 3000, 5000ms) |
| `ws_connections_active` | Gauge | — | Current number of open WebSocket connections |

### Metrics Aggregation

The Next.js `/api/metrics` route aggregates metrics from two sources:
1. Its own `prom-client` registry (captures metrics from the `withLogger` wrapper in the API process).
2. A fetch to `http://127.0.0.1:8080/metrics` on the WebSocket server (captures `ws_connections_active` and metrics from WebSocket-originated inference calls).

This ensures Prometheus sees a unified metrics surface from a single scrape target.

### Inference Logging Pipeline

```
streamText() → withLogger() → POST /api/ingest → BullMQ queue → Worker → inference_logs table
```

The `withLogger` wrapper:
1. Wraps the `streamText()` call and proxies the `textStream` async iterator.
2. Records the start time before the call.
3. On stream completion: increments `llm_requests_total` (success), observes `llm_latency_ms`, and sends a log payload to `/api/ingest`.
4. On error: increments `llm_requests_total` (error), sends a log payload with the error message.

The log payload is validated by `IngestPayloadSchema` (Zod) at both the API route and the worker.

### PII Redaction

Before writing to `inference_logs`, the worker scrubs `inputPreview` and `outputPreview` through the `redact()` function, which removes:
- Credit card numbers (13-16 digit sequences)
- Aadhaar numbers (12-digit Indian ID)
- PAN card numbers (Indian tax ID format)
- Email addresses
- Phone numbers (with international prefixes)

### Structured Console Logging

All server-side log lines are prefixed with context tags:
- `[ws]` — WebSocket server events (connections, messages, errors, idle phases)
- `[token-guard]` — Context window budget warnings
- `[Ingest API]` — Ingestion endpoint errors

### Grafana Dashboard

The Docker Compose stack provisions:
- A Prometheus datasource pointing to `http://prometheus:9090`
- A pre-built dashboard (`docker/grafana/dashboard.json`) with panels for LLM request rates, latency distributions, and active connection counts.

Access at [http://localhost:3001](http://localhost:3001) with credentials `admin/admin`.

---

## Token Optimization Strategy

### Context Window Management

The `buildContextWindow()` function enforces a hard cap of 20 messages (`MAX_CONTEXT_MESSAGES`). When the conversation exceeds this limit, only the most recent 20 messages are sent to the model. This is a sliding window — no summarization or compression is applied to older messages.

### Token Budget Warning

The `warnIfOverBudget()` function estimates the total token count (system prompt + context messages) using a `chars / 4` heuristic. If the estimate exceeds `TOKEN_WARNING_THRESHOLD` (8,000 tokens), a warning is logged:

```
[token-guard] Estimated 9200 tokens (threshold: 8000). Context: 18 messages, 8800 est. tokens.
```

This is a **warning only** — the request proceeds regardless. The warning signals that context trimming or model switching should be considered.

### Interruption Context Injection

When a user interrupts a streaming response, the system analyzes the partial output with `analyzeInterruption()`:
- **Completed sentences** — Full sentences (ending with `.`, `!`, `?`) that the AI finished.
- **Interrupted sentence** — The partial sentence the AI was mid-way through when cut off.

This analysis is injected as a system message via `buildInterruptionContext()`:

```
[INTERRUPTION CONTEXT] You were speaking but the user interrupted you.
You had fully said: "I can help you with that." 
You were in the middle of saying: "Let me start by" when you were cut off.
The user interrupted with: "Actually, can you do X instead?"
Please respond to the user's interruption, continuing or adjusting your thoughts naturally...
```

This prevents the AI from repeating completed sentences while maintaining conversational continuity.

### Streaming Optimization

- Tokens are streamed one-by-one rather than buffered, minimizing time-to-first-token visibility.
- The `withLogger` proxy intercepts the async iterator without buffering — each token passes through immediately.
- Token usage is retrieved asynchronously after stream completion (`await result.usage`) to avoid blocking the stream.

---

## API & WebSocket Documentation

### REST Endpoints

#### `GET /api/conversations`

Returns all conversations with message stats, ordered by most recent activity.

**Response:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "a1b2c3d4-...",
      "title": "Help with TypeScript generics",
      "status": "active",
      "model": "openai/gpt-4o-mini",
      "provider": "openrouter",
      "createdAt": "2026-05-23T10:00:00.000Z",
      "updatedAt": "2026-05-23T10:05:00.000Z",
      "messageCount": 8,
      "lastMessagePreview": "Sure! TypeScript generics allow you to create reusable..."
    }
  ]
}
```

#### `GET /api/conversations/:id`

Returns a single conversation with all its messages, ordered chronologically.

**Response:**
```json
{
  "success": true,
  "conversation": {
    "id": "a1b2c3d4-...",
    "title": "Help with TypeScript generics",
    "status": "active",
    "model": "openai/gpt-4o-mini",
    "provider": "openrouter",
    "createdAt": "2026-05-23T10:00:00.000Z",
    "updatedAt": "2026-05-23T10:05:00.000Z",
    "messages": [
      {
        "id": "m1-...",
        "conversationId": "a1b2c3d4-...",
        "role": "assistant",
        "content": "Hello! How can I help you today?",
        "status": "completed",
        "createdAt": "2026-05-23T10:00:01.000Z"
      },
      {
        "id": "m2-...",
        "conversationId": "a1b2c3d4-...",
        "role": "user",
        "content": "Can you explain TypeScript generics?",
        "status": "completed",
        "createdAt": "2026-05-23T10:00:15.000Z"
      }
    ]
  }
}
```

#### `DELETE /api/conversations/:id`

Deletes a conversation and all its messages (cascade).

**Response:**
```json
{ "success": true }
```

#### `POST /api/ingest`

Accepts inference telemetry payloads and enqueues them for async processing.

**Request:**
```json
{
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "status": "success",
  "latencyMs": 2340,
  "tokens": {
    "promptTokens": 150,
    "completionTokens": 89,
    "totalTokens": 239
  },
  "conversationId": "a1b2c3d4-...",
  "inputPreview": "Can you explain TypeScript generics?",
  "outputPreview": "Sure! TypeScript generics allow you to..."
}
```

**Response:**
```json
{ "success": true }
```

#### `GET /api/metrics`

Returns Prometheus-formatted metrics aggregated from the Next.js process and the WebSocket server.

**Response:** `text/plain` (Prometheus exposition format)

---

### WebSocket Protocol

**Connection**: `ws://localhost:8080?model=<model_id>&conversationId=<uuid>`

Both parameters are optional:
- `model` — Falls back to `DEFAULT_MODEL` (`openai/gpt-4o-mini`) if omitted or invalid.
- `conversationId` — If provided, resumes an existing conversation. If omitted, creates a new one.

#### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `user_message` | `{ type: "user_message", text: string }` | Send a message. Triggers AI response. |
| `cancel` | `{ type: "cancel" }` | Abort the current AI generation. |
| `user_typing` | `{ type: "user_typing" }` | User started typing (debounce client-side). |
| `user_stopped_typing` | `{ type: "user_stopped_typing" }` | User stopped typing. |

#### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `conversation_created` | `{ type: "conversation_created", conversationId: string, model: string }` | New conversation initialized. |
| `title_updated` | `{ type: "title_updated", conversationId: string, title: string }` | Conversation title set from first user message. |
| `ai_start` | `{ type: "ai_start" }` | AI generation started (show typing indicator). |
| `ai_token` | `{ type: "ai_token", token: string }` | Single token from the AI response stream. |
| `ai_done` | `{ type: "ai_done", tokensUsed?: number }` | AI generation completed normally. |
| `ai_interrupted` | `{ type: "ai_interrupted", partialContent: string, interruptedAtToken: number }` | AI generation was interrupted. `partialContent` contains the last 200 chars. |
| `ai_error` | `{ type: "ai_error", error: string, code: string }` | AI generation failed. `code` is a machine-readable error classification. |
| `typing_nudge` | `{ type: "typing_nudge", message: string }` | Encouraging message sent when user has been typing for 30+ seconds. |
| `conversation_ended` | `{ type: "conversation_ended", reason: "idle_timeout" }` | Conversation terminated due to inactivity. |

#### Event Lifecycle

```
New Conversation:
  open → conversation_created → ai_start → ai_token* → ai_done

User Message:
  user_message → ai_start → ai_token* → ai_done

Interruption (user sends message during stream):
  ai_token* → [user_message arrives] → ai_interrupted → ai_start → ai_token* → ai_done

Explicit Cancel:
  ai_token* → [cancel arrives] → ai_interrupted → ai_done{status:"cancelled"}

Idle Timeout:
  [15s silence] → ai_start → ai_token* → ai_done → [15s silence] → conversation_ended
```

---

## Folder Structure

```
tf_ai/
├── app/                          # Next.js App Router
│   ├── api/
│   │   ├── chat/                 # (Reserved)
│   │   ├── conversations/        # REST API for conversation CRUD
│   │   │   ├── [id]/
│   │   │   │   └── route.ts      # GET (detail + messages), DELETE
│   │   │   └── route.ts          # GET (list with stats)
│   │   ├── ingest/
│   │   │   └── route.ts          # POST — inference log ingestion
│   │   └── metrics/
│   │       └── route.ts          # GET — aggregated Prometheus metrics
│   ├── assistant.tsx             # Main client component (WebSocket hook + UI orchestration)
│   ├── globals.css               # Global styles and Tailwind base
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Entry page (renders <Assistant />)
│
├── components/                   # React UI components
│   ├── thread.tsx                # Chat thread (messages, timestamps, interruption badges)
│   ├── thread-list.tsx           # Thread listing
│   ├── threadlist-sidebar.tsx    # Sidebar with conversation list, model picker, dark mode
│   ├── typing-indicator.tsx      # AI typing animation
│   ├── markdown-text.tsx         # Markdown rendering for AI responses
│   ├── reasoning.tsx             # Reasoning/thinking display
│   ├── attachment.tsx            # File attachment display
│   ├── tool-fallback.tsx         # Tool call fallback display
│   ├── tool-group.tsx            # Tool grouping
│   ├── tooltip-icon-button.tsx   # Reusable icon button with tooltip
│   ├── github.tsx                # GitHub link component
│   └── ui/                      # shadcn/ui primitives (Button, Dialog, Sidebar, etc.)
│
├── lib/                          # Shared libraries
│   ├── ai/
│   │   ├── context.ts            # Context window builder, interruption analyzer, token estimator
│   │   └── models.ts             # Model registry, validation, and resolution
│   ├── db/
│   │   ├── index.ts              # Drizzle + postgres.js connection
│   │   ├── queries.ts            # All database queries (conversations, messages, inference logs)
│   │   └── schema.ts             # Drizzle schema definitions (3 tables)
│   ├── errors/
│   │   └── ai-errors.ts          # AI error classifier (pattern → code → user message)
│   ├── metrics/
│   │   └── prometheus.ts         # Prometheus registry + metric definitions
│   ├── pii/
│   │   └── redact.ts             # PII redaction (cards, IDs, emails, phones)
│   ├── queue/
│   │   └── producer.ts           # BullMQ queue + enqueueLog() producer
│   ├── sdk/
│   │   ├── logger.ts             # withLogger() — inference telemetry wrapper (Proxy-based stream interception)
│   │   └── types.ts              # Zod schemas for ingest payloads
│   ├── store/
│   │   └── conversation-store.ts # Zustand store for sidebar conversation state
│   └── utils.ts                  # Utility functions (cn)
│
├── worker/
│   └── index.ts                  # BullMQ worker — consumes ingest queue, applies PII redaction, writes to DB
│
├── hooks/                        # React hooks
│
├── docker/                       # Infrastructure configuration
│   ├── prometheus.yml            # Prometheus scrape config
│   └── grafana/
│       ├── datasource.yml        # Grafana Prometheus datasource
│       ├── dashboard.yml         # Grafana dashboard provisioning
│       └── dashboard.json        # Pre-built TaskFlow dashboard
│
├── drizzle/                      # Drizzle migration output
│
├── server.ts                     # Bun WebSocket server (AI orchestration, session management)
├── docker-compose.yml            # Full stack compose (6 services)
├── Dockerfile                    # Multi-stage app build (Next.js + WS server)
├── Dockerfile.worker             # Worker-only build
├── drizzle.config.ts             # Drizzle Kit configuration
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
```

---

## Future Improvements

### What I Would Improve With More Time

**Conversation Intelligence**
- **Semantic memory via vector embeddings** — Store message embeddings in pgvector. When the sliding window drops old messages, use cosine similarity to retrieve relevant earlier context. This preserves long-term conversational coherence without sending the full history.
- **LLM-based summarization** — When a conversation exceeds the context window, generate a running summary of earlier exchanges and inject it as a system message.
- **Smarter interruption analysis** — Use the LLM itself to determine what was "important" in the interrupted response vs. what can be safely dropped, rather than relying on sentence-boundary heuristics.

**Infrastructure & Reliability**
- **Distributed session store** — Serialize session state (minus non-serializable fields) to Redis for cross-server recovery and horizontal scaling.
- **WebSocket connection registry** — Track which server owns which `conversationId` in Redis. Route Pub/Sub cancellation events only to the relevant server.
- **Kubernetes deployment** — Helm chart with Horizontal Pod Autoscalers for the WebSocket server (based on `ws_connections_active`) and workers (based on BullMQ queue depth).
- **Database connection pooling** — External PgBouncer for multi-process connection sharing.
- **Circuit breaker for OpenRouter** — Prevent cascade failures when the AI provider is degraded. Fall back to a secondary model or return a graceful degradation message.

**Observability**
- **OpenTelemetry integration** — Replace ad-hoc console logging with structured spans. Trace a request from WebSocket message → AI inference → DB persistence → client delivery.
- **Request tracing** — Assign a trace ID per user message and propagate it through the inference logger, worker, and DB writes.
- **Alerting rules** — Prometheus alerting on `llm_latency_ms` P99 > 10s, `ws_connections_active` > threshold, and worker queue depth > threshold.
- **Log aggregation** — Ship structured JSON logs to Loki or Elasticsearch for centralized search and analysis.

**Security & Access Control**
- **Authentication** — JWT or session-based auth. Currently the system has no user identity — all conversations are globally visible.
- **RBAC** — Role-based access control for multi-tenant deployments.
- **Rate limiting** — Per-user rate limits on WebSocket messages and API calls.
- **API key rotation** — Secure OpenRouter key management with environment-specific secrets.

**Testing**
- **Unit tests** — For `buildContextWindow`, `analyzeInterruption`, `classifyAIError`, `redact`, and `resolveModel`.
- **Integration tests** — WebSocket connection lifecycle, message persistence roundtrip, and BullMQ job processing.
- **Load testing** — k6 or Artillery scripts for WebSocket connection saturation and concurrent streaming.
- **E2E tests** — Playwright tests for the full conversation flow: sidebar hydration → new conversation → send message → receive response → resume conversation.

**Developer Experience**
- **API documentation** — OpenAPI spec generated from Zod schemas via `zod-to-openapi`.
- **Database seeding** — Script to populate conversations and messages for development and demo purposes.
- **Hot-reload for WebSocket server** — Currently requires manual restart; integrate `bun --watch` or a file watcher.

---

## License

This project is provided as-is for educational and demonstration purposes.
]]>
