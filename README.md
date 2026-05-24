# TaskFlow AI

> A real-time conversational AI platform built on WebSocket streaming, designed for low-latency multi-model inference with full conversation persistence, interruption-aware response generation, and production-grade observability.

TaskFlow orchestrates conversations between users and large language models through a custom WebSocket server that streams tokens with humanized delivery timing, supports mid-stream interruptions, and persists every exchange to PostgreSQL. An asynchronous worker pipeline processes inference telemetry through Redis-backed BullMQ queues, while Prometheus and Grafana provide real-time system visibility.

---

## Table of Contents

- [Video Demo](#video-demo)
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
## Video Demo



## Features

### 💬 Core Conversational AI

- **Multi-model selection** — Switch between models from OpenAI, Google, DeepSeek, and Meta via OpenRouter. Model choice is persisted per conversation.
- **WebSocket streaming** — Token-by-token delivery with humanized timing: longer pauses at sentence boundaries (`.!?`), medium pauses at clause breaks (`,;:`), and slight jitter for natural cadence.
- **Interruption handling** — Users can send a new message while the AI is mid-response. The system aborts the current generation, analyzes where the response was interrupted, and injects interruption context into the next prompt so the AI responds naturally from the cutoff point.
- **Streaming cancellation** — Users can explicitly cancel an in-progress generation. Partial responses are persisted with `interrupted` status.

### 🗂 Conversation Management

- **Conversation persistence** — Every conversation and message is stored in PostgreSQL with full lifecycle tracking (`active`, `completed`, `cancelled`).
- **Conversation resumption** — Reconnecting to an existing conversation rehydrates the in-memory history from the database and resumes the idle timer.
- **Chat history sidebar** — A Zustand-powered store hydrated from the REST API on mount. Conversations are listed with title, preview, and message count.
- **Auto-titling** — The first user message becomes the conversation title (truncated to 80 characters).

### ✨ Engagement & UX

- **Typing indicators** — Debounced `user_typing` / `user_stopped_typing` events sent over WebSocket. The server tracks typing state per session.
- **AI typing indicator** — A visual indicator appears between `ai_start` and the first `ai_token`, then transitions to a streaming indicator.
- **Idle detection** — Two-phase idle system:
  - **Phase 1** (15s): The AI sends a gentle nudge ("Still there?").
  - **Phase 2** (15s after phase 1): Conversation is marked `completed` and the client receives a `conversation_ended` event.
- **Typing nudge** — If the user is typing for >30 seconds without sending, the AI sends an encouraging message ("Take your time — I'm here.").
- **Message timestamps** — Every message displays its creation time in the UI.
- **Interrupted badge** — Messages cut off by interruption display a visual "Interrupted" indicator.

### 📊 Observability

- **Prometheus metrics** — `llm_requests_total` (counter), `llm_latency_ms` (histogram), `ws_connections_active` (gauge).
- **Inference logging** — Every LLM call is logged with model, provider, latency, token counts, input/output previews, and error details.
- **PII redaction** — Credit cards, Aadhaar numbers, PAN cards, emails, and phone numbers are automatically scrubbed from inference logs before persistence.
- **Grafana dashboards** — Pre-provisioned dashboard and datasource configuration for immediate visibility.

### 🏗 Infrastructure

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
│                         Client (Browser)                         │
│  React 19 + @assistant-ui/react + Zustand conversation store     │
└──────────┬────────────────────┬─────────────────────────────────-┘
           │ WebSocket :8080    │ HTTP :3000
           ▼                    ▼
┌────────────────────┐  ┌──────────────────────┐
│  WebSocket Server  │  │    Next.js App        │
│  (Bun.serve)       │  │    (API Routes)       │
│                    │  │                       │
│  • AI streaming    │  │  • /api/conversations │
│  • Session mgmt    │  │  • /api/conversations │
│  • Idle detection  │  │    [id]               │
│  • Interruption    │  │  • /api/ingest        │
│  • Token delivery  │  │  • /api/metrics       │
│  • Persistence     │  │                       │
└──────┬───┬─────────┘  └──────┬───┬────────────┘
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

| Process | Port | Responsibility |
|---|---|---|
| **Next.js App** | `:3000` | React frontend, REST API routes, Prometheus metrics aggregation |
| **WebSocket Server** | `:8080` | Real-time communication, AI inference, streaming, interruption handling, session management |
| **Worker** | — | BullMQ consumer — PII redaction, telemetry persistence to `inference_logs` |

### Request Lifecycle

1. Client opens WebSocket to `:8080` with `?model=<id>&conversationId=<uuid>`
2. Server creates (or resumes) a session and conversation record
3. For new conversations, the server immediately streams a greeting
4. User messages arrive as `{ type: "user_message", text: "..." }`
5. The server pushes the message to in-memory history, persists to PostgreSQL, and calls `streamText()`
6. Tokens are delivered one-by-one with computed delays via `ai_token` events
7. On completion, `ai_done` is sent with token usage and the assistant message is persisted
8. The `withLogger` wrapper fires inference telemetry to `/api/ingest`, which enqueues a BullMQ job
9. The worker dequeues, applies PII redaction, and writes an `inference_logs` row

---

## Setup Instructions

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) & Docker Compose
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

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | Your OpenRouter API key — get it at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DATABASE_URL` | ✅ | PostgreSQL URI. Docker default: `postgresql://taskflow:taskflow_secret@localhost:5432/taskflow` |
| `REDIS_URL` | ✅ | Redis URI. Default: `redis://localhost:6379` |

### 4. Start Infrastructure Services

```bash
docker compose up postgres redis -d
```

Wait for both services to be healthy:

```bash
docker compose ps   # Both should show "healthy"
```

### 5. Run Database Migrations

```bash
bunx drizzle-kit push
```

### 6. Start the Application

**Development** (Next.js + WebSocket server concurrently):

```bash
bun run dev
```

This starts:
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

| Service | URL | Credentials |
|---|---|---|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | `admin` / `admin` |

### Full Stack via Docker Compose

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
| `id` | UUID (PK) | Unique conversation identifier |
| `title` | TEXT | Auto-generated from first user message (max 80 chars) |
| `status` | TEXT | Lifecycle state: `active`, `completed`, `cancelled` |
| `model` | TEXT | OpenRouter model ID used for this conversation |
| `provider` | TEXT | AI provider name (e.g. `openrouter`) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last activity time |

#### `messages`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Unique message identifier |
| `conversation_id` | UUID (FK → conversations, CASCADE) | Parent conversation |
| `role` | TEXT | `user`, `assistant`, or `system` |
| `content` | TEXT | Full message text |
| `status` | TEXT | `completed` or `interrupted` |
| `created_at` | TIMESTAMP | Message creation time |

#### `inference_logs`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Unique log entry |
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

**TEXT over ENUM for status fields** — Avoids migration friction when adding new states. Drizzle ORM validates at the query layer; the tradeoff of weaker DB-level guarantees is acceptable for iteration speed.

**CASCADE on messages, SET NULL on inference_logs.message_id** — Deleting a conversation purges its messages (data ownership). Inference logs are telemetry — they retain analytical value even if the specific message is deleted.

**UUIDs over auto-increment** — Supports distributed ID generation without coordination across processes or regions.

**Separate `inference_logs` table** — Inference telemetry has a different access pattern and lifecycle from conversation messages. Separating them allows independent indexing, retention policies, and query optimization.

**`status` on messages** — The `interrupted` status is critical for conversation resumption. Partial text is persisted with `status: "interrupted"`, driving the visual badge and informing the context window builder.

---

## Tradeoffs Made

### In-Memory Session State vs. Distributed State

Sessions live in a `Map<WebSocket, Session>` on the WebSocket server process. Storing in Redis would add latency to every token delivery and can't serialize `AbortController` references or timer handles — which are fundamentally process-local. **Risk:** Sessions are lost on restart. Mitigated by persisting all messages to PostgreSQL for reconstruction on reconnect.

### Fire-and-Forget Persistence

Message persistence is non-blocking (`insertMessage(...).catch(...)`). Blocking on DB writes during a streaming response would degrade perceived latency. **Risk:** If PostgreSQL is down during a write, that message is lost from the DB — though it was already delivered to the client.

### Single-Process WebSocket Server

A single Bun process handles all WebSocket connections. Bun's event loop handles thousands of concurrent connections efficiently, and the actual bottleneck is LLM inference latency (seconds), not connection handling (microseconds). **Risk:** Vertical scaling limit — documented below.

### Humanized Token Delays

Each token is delivered with a computed delay (30ms base + jitter, with extra pauses at punctuation). This creates a conversational cadence matching human speech patterns. **Cost:** ~2–5 seconds added to total delivery time per response. Acceptable for a conversational interface where naturalness matters more than raw throughput.

### Sliding Window Context (20 messages)

The context window is capped at the last 20 messages. Sending full history would either exceed token limits or consume excessive tokens. **What's lost:** Early conversation context is dropped with no summarization. See [Future Improvements](#future-improvements).

### Estimated Token Counting

Token count is estimated at ~4 chars/token instead of running a real tokenizer (e.g. `tiktoken`). Used only for budget warnings, not hard limits — accurate enough for the purpose at near-zero cost.

### Eventual Consistency in Sidebar

The sidebar is hydrated once on mount from the REST API, then updated optimistically via WebSocket events. Polling or change streams would add complexity for a single-user application. The eventual consistency window is negligible.

---

## Failure Handling

### WebSocket Disconnects

On `close`, the server clears all timers, aborts in-progress generation, deletes the session, and decrements `ws_connections_active`. The client can reconnect with the same `conversationId` to resume.

### AI Provider Failures

All `streamText()` errors pass through `classifyAIError()`, which maps known patterns to user-friendly messages:

| Code | Trigger Pattern | User Message |
|---|---|---|
| `RATE_LIMITED` | `429`, `rate limit`, `RESOURCE_EXHAUSTED` | "You've exceeded the model's rate limit…" |
| `QUOTA_EXCEEDED` | `billing`, `payment`, `QUOTA_EXCEEDED` | "You've hit the usage quota…" |
| `MODEL_NOT_FOUND` | `model not found`, `does not exist` | "This model is not available…" |
| `PERMISSION_DENIED` | `api key`, `unauthorized`, `403` | "API key is invalid…" |
| `SERVICE_UNAVAILABLE` | `503`, `overloaded` | "The AI service is temporarily unavailable…" |
| `TIMEOUT` | `timeout`, `DEADLINE_EXCEEDED` | "The request timed out…" |
| `CONTENT_BLOCKED` | `safety`, `content filter` | "Response blocked by content safety filter…" |
| `ABORT` | `AbortError` | *(Silent — no user message)* |
| `UNKNOWN` | Everything else | "Something went wrong. Please try again." |

### Interruption Race Conditions

Each generation is assigned a monotonically increasing `generationId`. The streaming loop checks `session.generationId !== thisGenerationId` on every token — if a new generation has started, the old loop exits silently. A 60ms sleep after abort ensures the old stream has fully terminated before `ai_interrupted` is sent.

### Redis / Pub/Sub Failures

Pub/Sub publish calls use `.catch(() => {})` — failures are silently swallowed since Pub/Sub is used for coordination, not data integrity. BullMQ connections use `maxRetriesPerRequest: null` so the worker reconnects indefinitely. If Redis is down, `/api/ingest` still returns `200` — the enqueue failure is logged but doesn't block the response.

### Partial Stream Persistence

When a stream is interrupted:
1. The accumulated partial response (`session.partialResponse`) is persisted with `status: "interrupted"`
2. The partial text is pushed to in-memory history for the next generation's context
3. `ai_interrupted` is sent to the client with the last 200 characters and the token count at cutoff

### Database Write Failures

All DB writes in the WebSocket server are fire-and-forget with error logging. A PostgreSQL outage does not crash the server or disrupt active conversations — only DB persistence is affected.

---

## Scaling Considerations

### Current Bottlenecks

1. **Single WebSocket process** — All connections on one Bun process. At ~10K concurrent connections, event loop saturation becomes likely.
2. **In-memory session store** — Process-local. Horizontal scaling requires sticky routing or session migration.
3. **N+1 query in conversation listing** — A separate count and last-message query per conversation. Becomes expensive at >1,000 conversations.

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
             └──────┬──────┘────────────┘
                    ▼
             ┌──────────┐
             │  Redis    │
             │  Pub/Sub  │
             └──────────┘
```

**Already distributed-safe:** PostgreSQL writes, Redis Pub/Sub (`cancel-session` broadcasts to all WS servers), BullMQ workers (multiple replicas consume from the same queue with job locking).

**Would need work:** Sticky session routing, metrics aggregation across processes, Redis-backed session recovery on crash.

### Scaling the Worker

BullMQ workers scale horizontally by default:

```bash
docker compose up --scale worker=4
```

### Database Scaling

- **Read replicas** for conversation listing and message retrieval
- **PgBouncer** for connection pooling across multiple processes
- **Range partitioning** on `inference_logs(created_at)` for time-based retention

---

## Observability & Logging

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `llm_requests_total` | Counter | `model`, `provider`, `status` | Total LLM inference requests |
| `llm_latency_ms` | Histogram | `model` | End-to-end latency (buckets: 100, 500, 1000, 3000, 5000ms) |
| `ws_connections_active` | Gauge | — | Current open WebSocket connections |

The `/api/metrics` route aggregates metrics from both the Next.js process and the WebSocket server (`http://127.0.0.1:8080/metrics`) into a single Prometheus scrape target.

### Inference Logging Pipeline

```
streamText() → withLogger() → POST /api/ingest → BullMQ queue → Worker → inference_logs table
```

### PII Redaction

The worker scrubs `inputPreview` and `outputPreview` before writing to `inference_logs`, removing:

- Credit card numbers (13–16 digit sequences)
- Aadhaar numbers (12-digit Indian national ID)
- PAN card numbers (Indian tax ID format)
- Email addresses
- Phone numbers (with international prefixes)

### Structured Console Logging

| Prefix | Source |
|---|---|
| `[ws]` | WebSocket server events (connections, messages, errors, idle phases) |
| `[token-guard]` | Context window budget warnings |
| `[Ingest API]` | Ingestion endpoint errors |

### Grafana Dashboard

Access at [http://localhost:3001](http://localhost:3001) (`admin` / `admin`). The Docker Compose stack auto-provisions:
- A Prometheus datasource pointing to `http://prometheus:9090`
- A pre-built dashboard with panels for LLM request rates, latency distributions, and active connection counts

---

## Token Optimization Strategy

### Context Window Management

`buildContextWindow()` enforces a hard cap of 20 messages (`MAX_CONTEXT_MESSAGES`). A sliding window — no summarization or compression is applied to older messages.

### Token Budget Warning

`warnIfOverBudget()` estimates total token count using a `chars / 4` heuristic. If the estimate exceeds `TOKEN_WARNING_THRESHOLD` (8,000 tokens), a warning is logged:

```
[token-guard] Estimated 9200 tokens (threshold: 8000). Context: 18 messages, 8800 est. tokens.
```

The request proceeds regardless — the warning signals that context trimming or model switching should be considered.

### Interruption Context Injection

When a user interrupts a streaming response, `analyzeInterruption()` splits the partial output into completed sentences and the interrupted partial sentence. This is injected as a system message:

```
[INTERRUPTION CONTEXT] You were speaking but the user interrupted you.
You had fully said: "I can help you with that."
You were in the middle of saying: "Let me start by" when you were cut off.
The user interrupted with: "Actually, can you do X instead?"
Please respond to the user's interruption, continuing or adjusting your thoughts naturally...
```

This prevents the AI from repeating completed sentences while maintaining conversational continuity.

---

## API & WebSocket Documentation

### REST Endpoints

#### `GET /api/conversations`

Returns all conversations ordered by most recent activity.

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
      "lastMessagePreview": "Sure! TypeScript generics allow you to..."
    }
  ]
}
```

#### `GET /api/conversations/:id`

Returns a single conversation with all messages ordered chronologically.

#### `DELETE /api/conversations/:id`

Deletes a conversation and all its messages (cascade). Returns `{ "success": true }`.

#### `POST /api/ingest`

Accepts inference telemetry and enqueues for async processing.

```json
{
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "status": "success",
  "latencyMs": 2340,
  "tokens": { "promptTokens": 150, "completionTokens": 89, "totalTokens": 239 },
  "conversationId": "a1b2c3d4-...",
  "inputPreview": "Can you explain TypeScript generics?",
  "outputPreview": "Sure! TypeScript generics allow you to..."
}
```

#### `GET /api/metrics`

Returns Prometheus exposition format metrics aggregated from both processes.

---

### WebSocket Protocol

**Connection:** `ws://localhost:8080?model=<model_id>&conversationId=<uuid>`

Both parameters are optional — `model` falls back to `DEFAULT_MODEL`, `conversationId` creates a new conversation if omitted.

#### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `user_message` | `{ type: "user_message", text: string }` | Send a message, triggers AI response |
| `cancel` | `{ type: "cancel" }` | Abort the current AI generation |
| `user_typing` | `{ type: "user_typing" }` | User started typing |
| `user_stopped_typing` | `{ type: "user_stopped_typing" }` | User stopped typing |

#### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `conversation_created` | `{ conversationId, model }` | New conversation initialized |
| `title_updated` | `{ conversationId, title }` | Title set from first user message |
| `ai_start` | — | Generation started — show typing indicator |
| `ai_token` | `{ token: string }` | Single token from the stream |
| `ai_done` | `{ tokensUsed?: number }` | Generation completed normally |
| `ai_interrupted` | `{ partialContent, interruptedAtToken }` | Generation was interrupted |
| `ai_error` | `{ error: string, code: string }` | Generation failed |
| `typing_nudge` | `{ message: string }` | Encouraging message after 30s of typing |
| `conversation_ended` | `{ reason: "idle_timeout" }` | Conversation ended due to inactivity |

#### Event Lifecycle

```
New Conversation:
  open → conversation_created → ai_start → ai_token* → ai_done

User Message:
  user_message → ai_start → ai_token* → ai_done

Interruption:
  ai_token* → [user_message] → ai_interrupted → ai_start → ai_token* → ai_done

Explicit Cancel:
  ai_token* → [cancel] → ai_interrupted → ai_done{status:"cancelled"}

Idle Timeout:
  [15s silence] → ai_start → ai_token* → ai_done → [15s silence] → conversation_ended
```

---

## Folder Structure

```
tf_ai/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── conversations/            # REST API for conversation CRUD
│   │   │   ├── [id]/route.ts         # GET (detail + messages), DELETE
│   │   │   └── route.ts              # GET (list with stats)
│   │   ├── ingest/route.ts           # POST — inference log ingestion
│   │   └── metrics/route.ts          # GET — aggregated Prometheus metrics
│   ├── assistant.tsx                 # Main client component (WebSocket + UI)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                       # React UI components
│   ├── thread.tsx                    # Chat thread (messages, timestamps, badges)
│   ├── thread-list.tsx
│   ├── threadlist-sidebar.tsx        # Sidebar with model picker, dark mode
│   ├── typing-indicator.tsx
│   ├── markdown-text.tsx
│   └── ui/                           # shadcn/ui primitives
│
├── lib/                              # Shared libraries
│   ├── ai/
│   │   ├── context.ts                # Context window builder, interruption analyzer
│   │   └── models.ts                 # Model registry and validation
│   ├── db/
│   │   ├── index.ts                  # Drizzle + postgres.js connection
│   │   ├── queries.ts                # All database queries
│   │   └── schema.ts                 # Drizzle schema (3 tables)
│   ├── errors/ai-errors.ts           # AI error classifier
│   ├── metrics/prometheus.ts         # Prometheus registry + metric definitions
│   ├── pii/redact.ts                 # PII redaction
│   ├── queue/producer.ts             # BullMQ producer
│   ├── sdk/
│   │   ├── logger.ts                 # withLogger() — inference telemetry wrapper
│   │   └── types.ts                  # Zod schemas for ingest payloads
│   └── store/conversation-store.ts   # Zustand conversation store
│
├── worker/index.ts                   # BullMQ worker — PII redaction + DB writes
├── hooks/                            # React hooks
├── docker/
│   ├── prometheus.yml
│   └── grafana/
│       ├── datasource.yml
│       ├── dashboard.yml
│       └── dashboard.json
├── drizzle/                          # Drizzle migration output
├── server.ts                         # Bun WebSocket server
├── docker-compose.yml
├── Dockerfile
├── Dockerfile.worker
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Future Improvements

### Conversation Intelligence
- **Semantic memory via pgvector** — Store message embeddings and use cosine similarity to retrieve relevant earlier context when the sliding window drops old messages
- **LLM-based summarization** — Generate a running summary of earlier exchanges and inject as a system message when the context window is exceeded
- **Smarter interruption analysis** — Use the LLM itself to determine what was "important" in the interrupted response vs. what can be safely dropped

### Infrastructure & Reliability
- **Distributed session store** — Serialize session state to Redis for cross-server recovery and horizontal scaling
- **WebSocket connection registry** — Track which server owns which `conversationId` in Redis for targeted Pub/Sub routing
- **Kubernetes deployment** — Helm chart with HPAs for the WebSocket server (on `ws_connections_active`) and workers (on BullMQ queue depth)
- **PgBouncer** — External connection pooler for multi-process deployments
- **Circuit breaker for OpenRouter** — Graceful fallback to a secondary model when the provider is degraded

### Observability
- **OpenTelemetry** — Replace ad-hoc logging with structured spans tracing each request end-to-end
- **Prometheus alerting** — Alert on `llm_latency_ms` P99 > 10s, `ws_connections_active` > threshold, worker queue depth > threshold
- **Log aggregation** — Ship structured JSON logs to Loki or Elasticsearch

### Security & Access Control
- **Authentication** — JWT or session-based auth (currently no user identity — all conversations are globally visible)
- **Rate limiting** — Per-user limits on WebSocket messages and API calls
- **RBAC** — Role-based access for multi-tenant deployments

### Testing
- **Unit tests** — `buildContextWindow`, `analyzeInterruption`, `classifyAIError`, `redact`, `resolveModel`
- **Integration tests** — WebSocket lifecycle, message persistence roundtrip, BullMQ job processing
- **Load testing** — k6 or Artillery scripts for WebSocket saturation and concurrent streaming
- **E2E tests** — Playwright for the full flow: sidebar → new conversation → send → receive → resume

### Developer Experience
- **OpenAPI spec** — Generated from Zod schemas via `zod-to-openapi`
- **Database seeding** — Script to populate conversations and messages for development
- **Hot-reload for WebSocket server** — Integrate `bun --watch` to avoid manual restarts

---

## License

This project is provided as-is for educational and demonstration purposes.# TaskFlow AI

> A real-time conversational AI platform built on WebSocket streaming, designed for low-latency multi-model inference with full conversation persistence, interruption-aware response generation, and production-grade observability.

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

### 💬 Core Conversational AI

- **Multi-model selection** — Switch between models from OpenAI, Google, DeepSeek, and Meta via OpenRouter. Model choice is persisted per conversation.
- **WebSocket streaming** — Token-by-token delivery with humanized timing: longer pauses at sentence boundaries (`.!?`), medium pauses at clause breaks (`,;:`), and slight jitter for natural cadence.
- **Interruption handling** — Users can send a new message while the AI is mid-response. The system aborts the current generation, analyzes where the response was interrupted, and injects interruption context into the next prompt so the AI responds naturally from the cutoff point.
- **Streaming cancellation** — Users can explicitly cancel an in-progress generation. Partial responses are persisted with `interrupted` status.

### 🗂 Conversation Management

- **Conversation persistence** — Every conversation and message is stored in PostgreSQL with full lifecycle tracking (`active`, `completed`, `cancelled`).
- **Conversation resumption** — Reconnecting to an existing conversation rehydrates the in-memory history from the database and resumes the idle timer.
- **Chat history sidebar** — A Zustand-powered store hydrated from the REST API on mount. Conversations are listed with title, preview, and message count.
- **Auto-titling** — The first user message becomes the conversation title (truncated to 80 characters).

### ✨ Engagement & UX

- **Typing indicators** — Debounced `user_typing` / `user_stopped_typing` events sent over WebSocket. The server tracks typing state per session.
- **AI typing indicator** — A visual indicator appears between `ai_start` and the first `ai_token`, then transitions to a streaming indicator.
- **Idle detection** — Two-phase idle system:
  - **Phase 1** (15s): The AI sends a gentle nudge ("Still there?").
  - **Phase 2** (15s after phase 1): Conversation is marked `completed` and the client receives a `conversation_ended` event.
- **Typing nudge** — If the user is typing for >30 seconds without sending, the AI sends an encouraging message ("Take your time — I'm here.").
- **Message timestamps** — Every message displays its creation time in the UI.
- **Interrupted badge** — Messages cut off by interruption display a visual "Interrupted" indicator.

### 📊 Observability

- **Prometheus metrics** — `llm_requests_total` (counter), `llm_latency_ms` (histogram), `ws_connections_active` (gauge).
- **Inference logging** — Every LLM call is logged with model, provider, latency, token counts, input/output previews, and error details.
- **PII redaction** — Credit cards, Aadhaar numbers, PAN cards, emails, and phone numbers are automatically scrubbed from inference logs before persistence.
- **Grafana dashboards** — Pre-provisioned dashboard and datasource configuration for immediate visibility.

### 🏗 Infrastructure

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
│                         Client (Browser)                         │
│  React 19 + @assistant-ui/react + Zustand conversation store     │
└──────────┬────────────────────┬─────────────────────────────────-┘
           │ WebSocket :8080    │ HTTP :3000
           ▼                    ▼
┌────────────────────┐  ┌──────────────────────┐
│  WebSocket Server  │  │    Next.js App        │
│  (Bun.serve)       │  │    (API Routes)       │
│                    │  │                       │
│  • AI streaming    │  │  • /api/conversations │
│  • Session mgmt    │  │  • /api/conversations │
│  • Idle detection  │  │    [id]               │
│  • Interruption    │  │  • /api/ingest        │
│  • Token delivery  │  │  • /api/metrics       │
│  • Persistence     │  │                       │
└──────┬───┬─────────┘  └──────┬───┬────────────┘
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

| Process | Port | Responsibility |
|---|---|---|
| **Next.js App** | `:3000` | React frontend, REST API routes, Prometheus metrics aggregation |
| **WebSocket Server** | `:8080` | Real-time communication, AI inference, streaming, interruption handling, session management |
| **Worker** | — | BullMQ consumer — PII redaction, telemetry persistence to `inference_logs` |

### Request Lifecycle

1. Client opens WebSocket to `:8080` with `?model=<id>&conversationId=<uuid>`
2. Server creates (or resumes) a session and conversation record
3. For new conversations, the server immediately streams a greeting
4. User messages arrive as `{ type: "user_message", text: "..." }`
5. The server pushes the message to in-memory history, persists to PostgreSQL, and calls `streamText()`
6. Tokens are delivered one-by-one with computed delays via `ai_token` events
7. On completion, `ai_done` is sent with token usage and the assistant message is persisted
8. The `withLogger` wrapper fires inference telemetry to `/api/ingest`, which enqueues a BullMQ job
9. The worker dequeues, applies PII redaction, and writes an `inference_logs` row

---

## Setup Instructions

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Docker](https://www.docker.com/) & Docker Compose
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

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | Your OpenRouter API key — get it at [openrouter.ai/keys](https://openrouter.ai/keys) |
| `DATABASE_URL` | ✅ | PostgreSQL URI. Docker default: `postgresql://taskflow:taskflow_secret@localhost:5432/taskflow` |
| `REDIS_URL` | ✅ | Redis URI. Default: `redis://localhost:6379` |

### 4. Start Infrastructure Services

```bash
docker compose up postgres redis -d
```

Wait for both services to be healthy:

```bash
docker compose ps   # Both should show "healthy"
```

### 5. Run Database Migrations

```bash
bunx drizzle-kit push
```

### 6. Start the Application

**Development** (Next.js + WebSocket server concurrently):

```bash
bun run dev
```

This starts:
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

| Service | URL | Credentials |
|---|---|---|
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | `admin` / `admin` |

### Full Stack via Docker Compose

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
| `id` | UUID (PK) | Unique conversation identifier |
| `title` | TEXT | Auto-generated from first user message (max 80 chars) |
| `status` | TEXT | Lifecycle state: `active`, `completed`, `cancelled` |
| `model` | TEXT | OpenRouter model ID used for this conversation |
| `provider` | TEXT | AI provider name (e.g. `openrouter`) |
| `created_at` | TIMESTAMP | Creation time |
| `updated_at` | TIMESTAMP | Last activity time |

#### `messages`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Unique message identifier |
| `conversation_id` | UUID (FK → conversations, CASCADE) | Parent conversation |
| `role` | TEXT | `user`, `assistant`, or `system` |
| `content` | TEXT | Full message text |
| `status` | TEXT | `completed` or `interrupted` |
| `created_at` | TIMESTAMP | Message creation time |

#### `inference_logs`

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID (PK) | Unique log entry |
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

**TEXT over ENUM for status fields** — Avoids migration friction when adding new states. Drizzle ORM validates at the query layer; the tradeoff of weaker DB-level guarantees is acceptable for iteration speed.

**CASCADE on messages, SET NULL on inference_logs.message_id** — Deleting a conversation purges its messages (data ownership). Inference logs are telemetry — they retain analytical value even if the specific message is deleted.

**UUIDs over auto-increment** — Supports distributed ID generation without coordination across processes or regions.

**Separate `inference_logs` table** — Inference telemetry has a different access pattern and lifecycle from conversation messages. Separating them allows independent indexing, retention policies, and query optimization.

**`status` on messages** — The `interrupted` status is critical for conversation resumption. Partial text is persisted with `status: "interrupted"`, driving the visual badge and informing the context window builder.

---

## Tradeoffs Made

### In-Memory Session State vs. Distributed State

Sessions live in a `Map<WebSocket, Session>` on the WebSocket server process. Storing in Redis would add latency to every token delivery and can't serialize `AbortController` references or timer handles — which are fundamentally process-local. **Risk:** Sessions are lost on restart. Mitigated by persisting all messages to PostgreSQL for reconstruction on reconnect.

### Fire-and-Forget Persistence

Message persistence is non-blocking (`insertMessage(...).catch(...)`). Blocking on DB writes during a streaming response would degrade perceived latency. **Risk:** If PostgreSQL is down during a write, that message is lost from the DB — though it was already delivered to the client.

### Single-Process WebSocket Server

A single Bun process handles all WebSocket connections. Bun's event loop handles thousands of concurrent connections efficiently, and the actual bottleneck is LLM inference latency (seconds), not connection handling (microseconds). **Risk:** Vertical scaling limit — documented below.

### Humanized Token Delays

Each token is delivered with a computed delay (30ms base + jitter, with extra pauses at punctuation). This creates a conversational cadence matching human speech patterns. **Cost:** ~2–5 seconds added to total delivery time per response. Acceptable for a conversational interface where naturalness matters more than raw throughput.

### Sliding Window Context (20 messages)

The context window is capped at the last 20 messages. Sending full history would either exceed token limits or consume excessive tokens. **What's lost:** Early conversation context is dropped with no summarization. See [Future Improvements](#future-improvements).

### Estimated Token Counting

Token count is estimated at ~4 chars/token instead of running a real tokenizer (e.g. `tiktoken`). Used only for budget warnings, not hard limits — accurate enough for the purpose at near-zero cost.

### Eventual Consistency in Sidebar

The sidebar is hydrated once on mount from the REST API, then updated optimistically via WebSocket events. Polling or change streams would add complexity for a single-user application. The eventual consistency window is negligible.

---

## Failure Handling

### WebSocket Disconnects

On `close`, the server clears all timers, aborts in-progress generation, deletes the session, and decrements `ws_connections_active`. The client can reconnect with the same `conversationId` to resume.

### AI Provider Failures

All `streamText()` errors pass through `classifyAIError()`, which maps known patterns to user-friendly messages:

| Code | Trigger Pattern | User Message |
|---|---|---|
| `RATE_LIMITED` | `429`, `rate limit`, `RESOURCE_EXHAUSTED` | "You've exceeded the model's rate limit…" |
| `QUOTA_EXCEEDED` | `billing`, `payment`, `QUOTA_EXCEEDED` | "You've hit the usage quota…" |
| `MODEL_NOT_FOUND` | `model not found`, `does not exist` | "This model is not available…" |
| `PERMISSION_DENIED` | `api key`, `unauthorized`, `403` | "API key is invalid…" |
| `SERVICE_UNAVAILABLE` | `503`, `overloaded` | "The AI service is temporarily unavailable…" |
| `TIMEOUT` | `timeout`, `DEADLINE_EXCEEDED` | "The request timed out…" |
| `CONTENT_BLOCKED` | `safety`, `content filter` | "Response blocked by content safety filter…" |
| `ABORT` | `AbortError` | *(Silent — no user message)* |
| `UNKNOWN` | Everything else | "Something went wrong. Please try again." |

### Interruption Race Conditions

Each generation is assigned a monotonically increasing `generationId`. The streaming loop checks `session.generationId !== thisGenerationId` on every token — if a new generation has started, the old loop exits silently. A 60ms sleep after abort ensures the old stream has fully terminated before `ai_interrupted` is sent.

### Redis / Pub/Sub Failures

Pub/Sub publish calls use `.catch(() => {})` — failures are silently swallowed since Pub/Sub is used for coordination, not data integrity. BullMQ connections use `maxRetriesPerRequest: null` so the worker reconnects indefinitely. If Redis is down, `/api/ingest` still returns `200` — the enqueue failure is logged but doesn't block the response.

### Partial Stream Persistence

When a stream is interrupted:
1. The accumulated partial response (`session.partialResponse`) is persisted with `status: "interrupted"`
2. The partial text is pushed to in-memory history for the next generation's context
3. `ai_interrupted` is sent to the client with the last 200 characters and the token count at cutoff

### Database Write Failures

All DB writes in the WebSocket server are fire-and-forget with error logging. A PostgreSQL outage does not crash the server or disrupt active conversations — only DB persistence is affected.

---

## Scaling Considerations

### Current Bottlenecks

1. **Single WebSocket process** — All connections on one Bun process. At ~10K concurrent connections, event loop saturation becomes likely.
2. **In-memory session store** — Process-local. Horizontal scaling requires sticky routing or session migration.
3. **N+1 query in conversation listing** — A separate count and last-message query per conversation. Becomes expensive at >1,000 conversations.

### Horizontal Scaling Path

```
                    ┌───────────────┐
                    │ Load Balancer │
                    │ (sticky WS)   │
                    └──┬────┬───┬───┘
                       │    │   │
              ┌────────┘    │   └────────┐
              ▼             ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  WS-1    │ │  WS-2    │ │  WS-3    │
        │ (Bun)    │ │ (Bun)    │ │ (Bun)    │
        └────┬─────┘ └─────┬────┘ └─────┬────┘
             │             │            │
             └──────┬──────┘────────────┘ 
                    ▼
             ┌────────────┐
             │  Redis     │
             │  Pub/Sub   │
             └────────────┘
```

**Already distributed-safe:** PostgreSQL writes, Redis Pub/Sub (`cancel-session` broadcasts to all WS servers), BullMQ workers (multiple replicas consume from the same queue with job locking).

**Would need work:** Sticky session routing, metrics aggregation across processes, Redis-backed session recovery on crash.

### Scaling the Worker

BullMQ workers scale horizontally by default:

```bash
docker compose up --scale worker=4
```

### Database Scaling

- **Read replicas** for conversation listing and message retrieval
- **PgBouncer** for connection pooling across multiple processes
- **Range partitioning** on `inference_logs(created_at)` for time-based retention

---

## Observability & Logging

### Prometheus Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `llm_requests_total` | Counter | `model`, `provider`, `status` | Total LLM inference requests |
| `llm_latency_ms` | Histogram | `model` | End-to-end latency (buckets: 100, 500, 1000, 3000, 5000ms) |
| `ws_connections_active` | Gauge | — | Current open WebSocket connections |

The `/api/metrics` route aggregates metrics from both the Next.js process and the WebSocket server (`http://127.0.0.1:8080/metrics`) into a single Prometheus scrape target.

### Inference Logging Pipeline

```
streamText() → withLogger() → POST /api/ingest → BullMQ queue → Worker → inference_logs table
```

### PII Redaction

The worker scrubs `inputPreview` and `outputPreview` before writing to `inference_logs`, removing:

- Credit card numbers (13–16 digit sequences)
- Aadhaar numbers (12-digit Indian national ID)
- PAN card numbers (Indian tax ID format)
- Email addresses
- Phone numbers (with international prefixes)

### Structured Console Logging

| Prefix | Source |
|---|---|
| `[ws]` | WebSocket server events (connections, messages, errors, idle phases) |
| `[token-guard]` | Context window budget warnings |
| `[Ingest API]` | Ingestion endpoint errors |

### Grafana Dashboard

Access at [http://localhost:3001](http://localhost:3001) (`admin` / `admin`). The Docker Compose stack auto-provisions:
- A Prometheus datasource pointing to `http://prometheus:9090`
- A pre-built dashboard with panels for LLM request rates, latency distributions, and active connection counts

---

## Token Optimization Strategy

### Context Window Management

`buildContextWindow()` enforces a hard cap of 20 messages (`MAX_CONTEXT_MESSAGES`). A sliding window — no summarization or compression is applied to older messages.

### Token Budget Warning

`warnIfOverBudget()` estimates total token count using a `chars / 4` heuristic. If the estimate exceeds `TOKEN_WARNING_THRESHOLD` (8,000 tokens), a warning is logged:

```
[token-guard] Estimated 9200 tokens (threshold: 8000). Context: 18 messages, 8800 est. tokens.
```

The request proceeds regardless — the warning signals that context trimming or model switching should be considered.

### Interruption Context Injection

When a user interrupts a streaming response, `analyzeInterruption()` splits the partial output into completed sentences and the interrupted partial sentence. This is injected as a system message:

```
[INTERRUPTION CONTEXT] You were speaking but the user interrupted you.
You had fully said: "I can help you with that."
You were in the middle of saying: "Let me start by" when you were cut off.
The user interrupted with: "Actually, can you do X instead?"
Please respond to the user's interruption, continuing or adjusting your thoughts naturally...
```

This prevents the AI from repeating completed sentences while maintaining conversational continuity.

---

## API & WebSocket Documentation

### REST Endpoints

#### `GET /api/conversations`

Returns all conversations ordered by most recent activity.

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
      "lastMessagePreview": "Sure! TypeScript generics allow you to..."
    }
  ]
}
```

#### `GET /api/conversations/:id`

Returns a single conversation with all messages ordered chronologically.

#### `DELETE /api/conversations/:id`

Deletes a conversation and all its messages (cascade). Returns `{ "success": true }`.

#### `POST /api/ingest`

Accepts inference telemetry and enqueues for async processing.

```json
{
  "model": "openai/gpt-4o-mini",
  "provider": "openrouter",
  "status": "success",
  "latencyMs": 2340,
  "tokens": { "promptTokens": 150, "completionTokens": 89, "totalTokens": 239 },
  "conversationId": "a1b2c3d4-...",
  "inputPreview": "Can you explain TypeScript generics?",
  "outputPreview": "Sure! TypeScript generics allow you to..."
}
```

#### `GET /api/metrics`

Returns Prometheus exposition format metrics aggregated from both processes.

---

### WebSocket Protocol

**Connection:** `ws://localhost:8080?model=<model_id>&conversationId=<uuid>`

Both parameters are optional — `model` falls back to `DEFAULT_MODEL`, `conversationId` creates a new conversation if omitted.

#### Client → Server Events

| Event | Payload | Description |
|---|---|---|
| `user_message` | `{ type: "user_message", text: string }` | Send a message, triggers AI response |
| `cancel` | `{ type: "cancel" }` | Abort the current AI generation |
| `user_typing` | `{ type: "user_typing" }` | User started typing |
| `user_stopped_typing` | `{ type: "user_stopped_typing" }` | User stopped typing |

#### Server → Client Events

| Event | Payload | Description |
|---|---|---|
| `conversation_created` | `{ conversationId, model }` | New conversation initialized |
| `title_updated` | `{ conversationId, title }` | Title set from first user message |
| `ai_start` | — | Generation started — show typing indicator |
| `ai_token` | `{ token: string }` | Single token from the stream |
| `ai_done` | `{ tokensUsed?: number }` | Generation completed normally |
| `ai_interrupted` | `{ partialContent, interruptedAtToken }` | Generation was interrupted |
| `ai_error` | `{ error: string, code: string }` | Generation failed |
| `typing_nudge` | `{ message: string }` | Encouraging message after 30s of typing |
| `conversation_ended` | `{ reason: "idle_timeout" }` | Conversation ended due to inactivity |

#### Event Lifecycle

```
New Conversation:
  open → conversation_created → ai_start → ai_token* → ai_done

User Message:
  user_message → ai_start → ai_token* → ai_done

Interruption:
  ai_token* → [user_message] → ai_interrupted → ai_start → ai_token* → ai_done

Explicit Cancel:
  ai_token* → [cancel] → ai_interrupted → ai_done{status:"cancelled"}

Idle Timeout:
  [15s silence] → ai_start → ai_token* → ai_done → [15s silence] → conversation_ended
```

---

## Folder Structure

```
tf_ai/
├── app/                              # Next.js App Router
│   ├── api/
│   │   ├── conversations/            # REST API for conversation CRUD
│   │   │   ├── [id]/route.ts         # GET (detail + messages), DELETE
│   │   │   └── route.ts              # GET (list with stats)
│   │   ├── ingest/route.ts           # POST — inference log ingestion
│   │   └── metrics/route.ts          # GET — aggregated Prometheus metrics
│   ├── assistant.tsx                 # Main client component (WebSocket + UI)
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
│
├── components/                       # React UI components
│   ├── thread.tsx                    # Chat thread (messages, timestamps, badges)
│   ├── thread-list.tsx
│   ├── threadlist-sidebar.tsx        # Sidebar with model picker, dark mode
│   ├── typing-indicator.tsx
│   ├── markdown-text.tsx
│   └── ui/                           # shadcn/ui primitives
│
├── lib/                              # Shared libraries
│   ├── ai/
│   │   ├── context.ts                # Context window builder, interruption analyzer
│   │   └── models.ts                 # Model registry and validation
│   ├── db/
│   │   ├── index.ts                  # Drizzle + postgres.js connection
│   │   ├── queries.ts                # All database queries
│   │   └── schema.ts                 # Drizzle schema (3 tables)
│   ├── errors/ai-errors.ts           # AI error classifier
│   ├── metrics/prometheus.ts         # Prometheus registry + metric definitions
│   ├── pii/redact.ts                 # PII redaction
│   ├── queue/producer.ts             # BullMQ producer
│   ├── sdk/
│   │   ├── logger.ts                 # withLogger() — inference telemetry wrapper
│   │   └── types.ts                  # Zod schemas for ingest payloads
│   └── store/conversation-store.ts   # Zustand conversation store
│
├── worker/index.ts                   # BullMQ worker — PII redaction + DB writes
├── hooks/                            # React hooks
├── docker/
│   ├── prometheus.yml
│   └── grafana/
│       ├── datasource.yml
│       ├── dashboard.yml
│       └── dashboard.json
├── k8s/                              # Kubernetes manifests (kind self-hosted deployment)
│   ├── 01-config.yaml                # Configuration maps (Redis, DNS)
│   ├── 02-db-redis.yaml              # PostgreSQL & Redis Deployments, Services, PVCs
│   ├── 03-app.yaml                   # Next.js Web App & WebSocket Deployment & Service
│   ├── 04-worker.yaml                # BullMQ Background Worker Deployment
│   └── 05-observability.yaml         # Prometheus & Grafana deployments, dashboards, datasource configs
│
├── drizzle/                          # Drizzle migration output
├── server.ts                         # Bun WebSocket server
├── docker-compose.yml
├── Dockerfile
├── Dockerfile.worker
├── drizzle.config.ts
├── package.json
└── tsconfig.json
```

---

## Future Improvements

### Conversation Intelligence
- **Semantic memory via pgvector** — Store message embeddings and use cosine similarity to retrieve relevant earlier context when the sliding window drops old messages
- **LLM-based summarization** — Generate a running summary of earlier exchanges and inject as a system message when the context window is exceeded
- **Smarter interruption analysis** — Use the LLM itself to determine what was "important" in the interrupted response vs. what can be safely dropped

### Infrastructure & Reliability
- **Distributed session store** — Serialize session state to Redis for cross-server recovery and horizontal scaling
- **WebSocket connection registry** — Track which server owns which `conversationId` in Redis for targeted Pub/Sub routing
- **Kubernetes deployment** — Helm chart with HPAs for the WebSocket server (on `ws_connections_active`) and workers (on BullMQ queue depth)
- **PgBouncer** — External connection pooler for multi-process deployments
- **Circuit breaker for OpenRouter** — Graceful fallback to a secondary model when the provider is degraded

### Observability
- **OpenTelemetry** — Replace ad-hoc logging with structured spans tracing each request end-to-end
- **Prometheus alerting** — Alert on `llm_latency_ms` P99 > 10s, `ws_connections_active` > threshold, worker queue depth > threshold
- **Log aggregation** — Ship structured JSON logs to Loki or Elasticsearch

### Security & Access Control
- **Authentication** — JWT or session-based auth (currently no user identity — all conversations are globally visible)
- **Rate limiting** — Per-user limits on WebSocket messages and API calls
- **RBAC** — Role-based access for multi-tenant deployments

### Testing
- **Unit tests** — `buildContextWindow`, `analyzeInterruption`, `classifyAIError`, `redact`, `resolveModel`
- **Integration tests** — WebSocket lifecycle, message persistence roundtrip, BullMQ job processing
- **Load testing** — k6 or Artillery scripts for WebSocket saturation and concurrent streaming
- **E2E tests** — Playwright for the full flow: sidebar → new conversation → send → receive → resume

### Developer Experience
- **OpenAPI spec** — Generated from Zod schemas via `zod-to-openapi`
- **Database seeding** — Script to populate conversations and messages for development
- **Hot-reload for WebSocket server** — Integrate `bun --watch` to avoid manual restarts

---

## License

This project is provided as-is for educational and demonstration purposes.