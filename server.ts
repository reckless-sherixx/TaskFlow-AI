// @ts-nocheck
import { createOpenAI } from "@ai-sdk/openai";
import { type CoreMessage, streamText } from "ai";
import Redis from "ioredis";
import { buildContextWindow, warnIfOverBudget } from "./lib/ai/context";
import { resolveModel } from "./lib/ai/models";
import {
	createConversation,
	insertMessage,
	updateConversationStatus,
	updateConversationTitle,
} from "./lib/db/queries";
import { classifyAIError } from "./lib/errors/ai-errors";
import { withLogger } from "./lib/sdk/logger";

const openrouter = createOpenAI({
	baseURL: "https://openrouter.ai/api/v1",
	apiKey: process.env.OPENROUTER_API_KEY,
});

const PORT = 8080;

type IdlePhase = 0 | 1 | 2;

type Session = {
	history: CoreMessage[];
	abortController: AbortController | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
	isStreaming: boolean;
	partialResponse: string;
	conversationId?: string;
	idlePhase: IdlePhase;
	hasReceivedUserMessage: boolean;
	model: string;
};

const sessions = new Map<any, Session>();

const redisSub = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
redisSub.subscribe("cancel-session").catch(console.error);

redisSub.on("message", async (channel, message) => {
	if (channel === "cancel-session") {
		try {
			const { conversationId } = JSON.parse(message);
			if (!conversationId) return;

			for (const [ws, session] of sessions.entries()) {
				if (session.conversationId === conversationId) {
					console.log(`[ws] Cancelling session ${conversationId} via Redis`);
					if (session.isStreaming && session.abortController) {
						session.abortController.abort();
					}
					send(ws, { type: "ai_done", status: "cancelled" });
					break;
				}
			}
		} catch (err) {
			console.error("[ws] Error processing Redis message:", err);
		}
	}
});

const SYSTEM_PROMPT =
	"You are Taskflow, a warm and concise conversational AI. " +
	"Speak naturally like a real person. Be helpful, friendly, and brief.";

const GREETING_BOOTSTRAP =
	"[SYSTEM: New conversation started. Greet the user warmly in 1-2 short sentences.]";

const IDLE_PROMPT =
	"The user has been silent for a while. " +
	"Gently check if they're still there with a short, natural message.";

const IDLE_NUDGE_MS = 15_000;
const IDLE_TERMINATE_MS = 15_000;
const TOKEN_DELAY_MS = 35;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function send(ws: any, payload: object) {
	try {
		ws.send(JSON.stringify(payload));
	} catch {}
}

// ── Idle State Machine ──────────────────────────────────────────

function clearIdleTimer(session: Session) {
	if (session.idleTimer) {
		clearTimeout(session.idleTimer);
		session.idleTimer = null;
	}
}

function resetIdleTimer(session: Session, ws: any) {
	clearIdleTimer(session);
	session.idlePhase = 0;

	session.idleTimer = setTimeout(() => {
		if (session.isStreaming || session.idlePhase === 2) return;
		handleIdlePhase1(session, ws);
	}, IDLE_NUDGE_MS);
}

async function handleIdlePhase1(session: Session, ws: any) {
	session.idlePhase = 1;
	console.log(`[ws] Idle phase 1 — sending nudge for ${session.conversationId}`);

	await streamAIResponse(session, ws, { isIdleProbe: true });

	if (session.idlePhase !== 0) {
		session.idleTimer = setTimeout(() => {
			if (session.isStreaming || session.idlePhase === 0) return;
			handleIdlePhase2(session, ws);
		}, IDLE_TERMINATE_MS);
	}
}

async function handleIdlePhase2(session: Session, ws: any) {
	session.idlePhase = 2;
	console.log(`[ws] Idle phase 2 — terminating ${session.conversationId}`);

	clearIdleTimer(session);

	if (session.isStreaming && session.abortController) {
		session.abortController.abort();
	}

	if (session.conversationId) {
		updateConversationStatus(session.conversationId, "completed").catch(
			(err) => console.error("[ws] Failed to complete conversation:", err),
		);
	}

	send(ws, { type: "conversation_ended", reason: "idle_timeout" });
}

// ── AI Response Streaming ───────────────────────────────────────

async function streamAIResponse(
	session: Session,
	ws: any,
	options: {
		isIdleProbe?: boolean;
		isGreeting?: boolean;
	} = {},
) {
	const { isIdleProbe = false, isGreeting = false } = options;

	session.isStreaming = true;
	session.abortController = new AbortController();
	session.partialResponse = "";

	const contextMessages: CoreMessage[] = buildContextWindow(session.history);

	if (isGreeting) {
		contextMessages.push({ role: "user", content: GREETING_BOOTSTRAP });
	} else if (isIdleProbe) {
		contextMessages.push({ role: "user", content: IDLE_PROMPT });
	}

	warnIfOverBudget(contextMessages, SYSTEM_PROMPT);

	send(ws, { type: "ai_start" });

	try {
		const result = await withLogger(
			async () =>
				streamText({
					model: openrouter.chat(session.model),
					system: SYSTEM_PROMPT,
					messages: contextMessages,
					abortSignal: session.abortController.signal,
				}),
			{
			model: session.model,
				provider: "openrouter",
				conversationId: session.conversationId,
				inputPreview: isGreeting
					? "[greeting]"
					: isIdleProbe
						? "[idle-probe]"
						: (contextMessages[contextMessages.length - 1]?.content as string),
			},
		);

		for await (const chunk of result.textStream) {
			if (session.abortController.signal.aborted) break;

			session.partialResponse += chunk;
			send(ws, { type: "ai_token", token: chunk });
			await sleep(TOKEN_DELAY_MS);
		}

		if (!session.abortController.signal.aborted) {
			let tokensUsed = 0;
			try {
				const usage = await result.usage;
				tokensUsed = usage?.totalTokens ?? 0;
			} catch {}

			send(ws, { type: "ai_done", tokensUsed });

			if (session.partialResponse) {
				session.history.push({
					role: "assistant",
					content: session.partialResponse,
				});

				if (session.conversationId) {
					insertMessage({
						conversationId: session.conversationId,
						role: "assistant",
						content: session.partialResponse,
					}).catch((err) =>
						console.error("[ws] Failed to persist assistant message:", err),
					);
				}
			}
		}
	} catch (err: any) {
		const classified = classifyAIError(err);

		if (classified.code === "ABORT" || session.abortController?.signal.aborted) {
			// User-initiated cancel — don't send error
			return;
		}

		if (classified.shouldLog) {
			console.error(`[ws] AI error [${classified.code}]:`, err);
		}

		send(ws, {
			type: "ai_error",
			error: classified.userMessage,
			code: classified.code,
		});
	} finally {
		session.isStreaming = false;
		session.abortController = null;

		if (session.idlePhase !== 2) {
			if (!isIdleProbe) {
				resetIdleTimer(session, ws);
			}
		}
	}
}

// ── WebSocket Server ────────────────────────────────────────────

Bun.serve({
	port: PORT,

	fetch(req, server) {
		const url = new URL(req.url);
		const model = resolveModel(url.searchParams.get("model"));

		if (server.upgrade(req, { data: { model } })) return;
		return new Response("WebSocket upgrade failed", { status: 500 });
	},

	websocket: {
		async open(ws) {
			console.log("[ws] client connected");

			// Model is passed via URL query param — no race condition
			const model = (ws.data as { model: string })?.model || resolveModel(null);

			const session: Session = {
				history: [],
				abortController: null,
				idleTimer: null,
				isStreaming: false,
				partialResponse: "",
				idlePhase: 0,
				hasReceivedUserMessage: false,
				model,
			};
			sessions.set(ws, session);

			// Create conversation in DB with the correct model
			try {
				const conv = await createConversation({
					title: "New Conversation",
					status: "active",
					model,
					provider: "openrouter",
				});
				session.conversationId = conv.id;
				send(ws, { type: "conversation_created", conversationId: conv.id, model });
				console.log(`[ws] Created conversation ${conv.id} with model ${model}`);
			} catch (err) {
				console.error("[ws] Failed to create conversation:", err);
			}

			// Generate greeting — no fake user message, no sleep needed
			await streamAIResponse(session, ws, { isGreeting: true });
		},

		async message(ws, raw) {
			const session = sessions.get(ws);
			if (!session) return;

			if (session.idlePhase === 2) return;

			let data: { type: string; text?: string; conversationId?: string };
			try {
				data = JSON.parse(typeof raw === "string" ? raw : raw.toString());
			} catch {
				return;
			}

			if (data.conversationId && !session.conversationId) {
				session.conversationId = data.conversationId;
			}

			if (data.type === "cancel") {
				if (session.isStreaming && session.abortController) {
					session.abortController.abort();
					if (session.partialResponse) {
						session.history.push({
							role: "assistant",
							content: session.partialResponse,
						});
					}
					await sleep(60);
					send(ws, { type: "ai_done" });
				}
				return;
			}

			if (data.type !== "user_message" || !data.text) return;

			resetIdleTimer(session, ws);

			if (session.isStreaming && session.abortController) {
				session.abortController.abort();

				if (session.partialResponse) {
					session.history.push({
						role: "assistant",
						content: session.partialResponse,
					});
				}

				await sleep(60);
				send(ws, { type: "ai_interrupted" });
			}

			session.history.push({ role: "user", content: data.text });

			if (session.conversationId) {
				insertMessage({
					conversationId: session.conversationId,
					role: "user",
					content: data.text,
				}).catch((err) =>
					console.error("[ws] Failed to persist user message:", err),
				);

				if (!session.hasReceivedUserMessage) {
					session.hasReceivedUserMessage = true;
					const title = data.text.substring(0, 80);
					updateConversationTitle(session.conversationId, title).catch(
						(err) => console.error("[ws] Failed to update title:", err),
					);

					// Notify client about the title update for sidebar
					send(ws, {
						type: "title_updated",
						conversationId: session.conversationId,
						title,
					});
				}
			}

			await streamAIResponse(session, ws);
		},

		close(ws) {
			console.log("[ws] client disconnected");
			const session = sessions.get(ws);
			if (!session) return;

			clearIdleTimer(session);
			if (session.abortController) session.abortController.abort();
			sessions.delete(ws);
		},
	},
});

console.log(`[ws] WebSocket server listening on ws://localhost:${PORT}`);
