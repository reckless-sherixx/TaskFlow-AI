# TaskFlow AI

A production-ready conversational AI application built with Next.js, featuring a robust event-driven ingestion pipeline, a custom lightweight LLM SDK for observability, and multi-provider model support (Gemini & OpenRouter).

## Overview

TaskFlow AI serves as both a user-facing chatbot interface and an underlying telemetry platform. It captures granular inference logs (latency, tokens, status, PII-redacted previews) via a lightweight SDK wrapper, ingests them asynchronously using BullMQ and Redis, and stores them alongside conversation history in PostgreSQL.

## Features Completed
1. **Chatbot Application**
   - Multi-provider model selection (Gemini, Claude, GPT, etc.) via AI SDK.
   - Real-time streaming interface with simulated typing cadences.
   - Multi-turn conversational context stored in PostgreSQL.
2. **Lightweight SDK / Wrapper**
   - The `withLogger` SDK (located in `lib/sdk/logger.ts`) wraps all AI completions.
   - Automatically intercepts text streams to measure latency and token counts.
   - Pushes non-blocking JSON telemetry payloads to the ingestion API.
3. **Ingestion Pipeline & Event Architecture**
   - High-throughput `/api/ingest` endpoint accepts SDK payloads.
   - BullMQ worker (`worker/index.ts`) decouples API response times from database I/O.
   - Zod validation and PII redaction (`lib/pii/redact.ts`) happen asynchronously.
4. **Database Storage**
   - PostgreSQL (via Drizzle ORM) stores `conversations`, `messages`, and `inference_logs`.
   - Optimized schema designed for heavy read/write AI logging.
5. **Observability**
   - `prom-client` exposes metrics at `/api/metrics`.
   - Grafana dashboards automatically provisioned for LLM P99 latency, request throughput, and error rates.
6. **Infrastructure**
   - `docker-compose.yml` provides a one-click setup for the App, Worker, Postgres, Redis, Prometheus, and Grafana.
   - Fully containerized using `oven/bun` multi-stage Dockerfiles. K8s ready.

---

## Setup Instructions

### Prerequisites
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)
- [Bun](https://bun.sh/) (if running locally without Docker)

### Environment Variables
Copy the `.env.example` file to `.env.local` (or `.env` for Docker):
```bash
cp .env.example .env.local
```
Fill in the required keys:
```env
OPENROUTER_API_KEY=your_openrouter_key
DATABASE_URL=postgresql://taskflow:taskflow_secret@postgres:5432/taskflow
REDIS_URL=redis://redis:6379
```

### Running with Docker Compose (Recommended)
This command spins up the Next.js app, the background worker, Postgres, Redis, Prometheus, and Grafana.
```bash
docker compose up --build
```
- **App:** http://localhost:3000
- **Grafana:** http://localhost:3001 (User: `admin`, Pass: `admin`)

### Running Locally (Development)
You will need a running Postgres and Redis instance.
```bash
# Install dependencies
bun install

# Push database schema
bunx drizzle-kit push

# Start the Next.js app and the Worker concurrently
bun run dev
bun run worker
```

---

## Architecture Overview

1. **Frontend (Next.js):** Uses `@assistant-ui/react` for the chat interface. Communicates with the backend via WebSockets for bidirectional, low-latency streaming.
2. **WebSockets (`server.ts`):** A custom Bun WebSocket server handles streaming AI responses, user interruptions, and connection states.
3. **SDK Wrapper (`lib/sdk/logger.ts`):** Wraps standard `@ai-sdk/core` calls. On completion, it fires a non-blocking `fetch` to `/api/ingest`.
4. **Ingestion API:** Parses incoming telemetry and immediately dumps it onto a Redis-backed BullMQ queue (`ingest`).
5. **Worker:** A background process consumes the queue, applies Regex-based PII redaction to the input/output previews, and writes to Postgres.

## Schema Design Decisions
- **Relational Integrity:** `messages` belong to `conversations`. `inference_logs` belong to `conversations` and optionally specific `messages`. This allows us to join telemetry data against specific user sessions.
- **JSONB Extensibility:** Metadata is stored as `jsonb` allowing for flexible log attributes without schema migrations.
- **Separation of Concerns:** `inference_logs` are kept completely separate from user-facing `messages`. If telemetry fails, the chat still functions.

## Tradeoffs Made
- **Regex PII Redaction:** Currently using basic Regex for Emails/Phones for PII redaction. *Tradeoff:* Extremely fast, but lacks context awareness. An NLP-based approach (like Microsoft Presidio) would be more accurate but much slower and resource-intensive for a background worker.
- **WebSocket Backend:** We opted for a raw Bun WebSocket server instead of standard Next.js API Routes for the chat. *Tradeoff:* Requires a custom server entrypoint (`server.ts`), but allows for advanced real-time features like cross-tab synchronization and mid-stream interruptions.

## What I Would Improve With More Time
1. **Auth & Multi-tenancy:** Implement NextAuth or Clerk to tie conversations and inference logs to specific users and organizations.
2. **Vector Database / RAG:** Add a pgvector extension to Postgres to allow the chatbot to retrieve context from past documents.
3. **Advanced PII:** Offload PII redaction to a specialized NLP model or service rather than Regex to prevent data leakage of sensitive edge cases.
4. **End-to-End Testing:** Add Playwright tests to simulate multi-turn interactions and verify telemetry ingestion.
