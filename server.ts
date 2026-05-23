// @ts-nocheck
import { createOpenAI } from "@ai-sdk/openai";
import { type CoreMessage, streamText } from "ai";
import Redis from "ioredis";
import {
	buildContextWindow,
	buildInterruptionContext,
	estimateTokens,
	warnIfOverBudget,
} from "./lib/ai/context";
import { resolveModel } from "./lib/ai/models";
import {
	createConversation,
	insertMessage,
	updateConversationStatus,
	updateConversationTitle,
} from "./lib/db/queries";
import { classifyAIError } from "./lib/errors/ai-errors";
import { wsConnectionsActive } from "./lib/metrics/prometheus";
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
	generationId: number;
	tokenCount: number;
	typingNudgeTimer: ReturnType<typeof setTimeout> | null;
	typingNudgeSent: boolean;
	isUserTyping: boolean;
	lastTypingAt: number;
	lastInterruption: {
		partialContent: string;
		interruptedAtToken: number;
		userMessage: string;
	} | null;
};

const sessions = new Map<any, Session>();


const redisSub = new Redis(process.env.REDIS_URL || "redis://localhost:6379");
const redisPub = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

redisSub.subscribe("cancel-session", "typing-events").catch(console.error);

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
			console.error("[ws] Error processing Redis cancel-session:", err);
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

const TYPING_NUDGE_MESSAGES = [
	"Take your time — I'm here.",
	"Whenever you're ready.",
	"No rush — I'll be here when you're ready.",
	"Feel free to continue whenever you'd like.",
];

const IDLE_NUDGE_MS = 15_000;
const IDLE_TERMINATE_MS = 15_000;
const TYPING_NUDGE_MS = 30_000;


function computeTokenDelay(chunk: string): number {
	const base = 10;
	const jitter = Math.random() * 10;
	// Longer pause at sentence-ending punctuation
	if (/[.!?]\s*$/.test(chunk)) return base + jitter + 30;
	// Medium pause at clause boundaries
	if (/[,;:]\s*$/.test(chunk)) return base + jitter + 20;
	// Pause at paragraph breaks
	if (/\n/.test(chunk)) return base + jitter + 40;
	return base + jitter;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function send(ws: any, payload: object) {
	try {
		ws.send(JSON.stringify(payload));
	} catch { }
}


function clearTypingNudgeTimer(session: Session) {
	if (session.typingNudgeTimer) {
		clearTimeout(session.typingNudgeTimer);
		session.typingNudgeTimer = null;
	}
}

function startTypingNudgeTimer(session: Session, ws: any) {
	clearTypingNudgeTimer(session);
	if (session.typingNudgeSent) return;

	session.typingNudgeTimer = setTimeout(() => {
		if (!session.isUserTyping || session.typingNudgeSent) return;

		session.typingNudgeSent = true;
		const nudge = TYPING_NUDGE_MESSAGES[
			Math.floor(Math.random() * TYPING_NUDGE_MESSAGES.length)
		];
		send(ws, { type: "typing_nudge", message: nudge });
		console.log(`[ws] Sent typing nudge for ${session.conversationId}`);
	}, TYPING_NUDGE_MS);
}

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


async function streamAIResponse(
	session: Session,
	ws: any,
	options: {
		isIdleProbe?: boolean;
		isGreeting?: boolean;
	} = {},
) {
	const { isIdleProbe = false, isGreeting = false } = options;

	session.generationId++;
	const thisGenerationId = session.generationId;

	session.isStreaming = true;
	session.abortController = new AbortController();
	session.partialResponse = "";
	session.tokenCount = 0;

	const contextMessages: CoreMessage[] = buildContextWindow(session.history);

	if (session.lastInterruption) {
		if (!isGreeting && !isIdleProbe && session.lastInterruption.userMessage) {
			contextMessages.push(
				buildInterruptionContext(
					session.lastInterruption.partialContent,
					session.lastInterruption.userMessage,
				),
			);
		}
		session.lastInterruption = null;
	}

	if (isGreeting) {
		contextMessages.push({ role: "user", content: GREETING_BOOTSTRAP });
	} else if (isIdleProbe) {
		contextMessages.push({ role: "user", content: IDLE_PROMPT });
	}

	warnIfOverBudget(contextMessages, SYSTEM_PROMPT);

	send(ws, { type: "ai_start" });

	// Publish AI typing event
	redisPub.publish("typing-events", JSON.stringify({
		type: "ai_started_typing",
		conversationId: session.conversationId,
	})).catch(() => { });

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
			if (session.generationId !== thisGenerationId) break;
			if (session.abortController.signal.aborted) break;

			session.tokenCount++;

			// Yield character by character to ensure smooth human-like pacing
			const chars = chunk.split('');
			for (const char of chars) {
				if (session.generationId !== thisGenerationId) break;
				if (session.abortController.signal.aborted) break;

				session.partialResponse += char;
				send(ws, { type: "ai_token", token: char });
				await sleep(computeTokenDelay(char));
			}
		}

		if (
			session.generationId === thisGenerationId &&
			!session.abortController.signal.aborted
		) {
			let tokensUsed = 0;
			try {
				const usage = await result.usage;
				tokensUsed = usage?.totalTokens ?? 0;
			} catch { }

			if (!tokensUsed || tokensUsed === 0) {
				const promptTokens = estimateTokens(contextMessages);
				const completionTokens = Math.ceil((session.partialResponse?.length || 0) / 4);
				tokensUsed = promptTokens + completionTokens;
			}

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
						status: "completed",
					}).catch((err) =>
						console.error("[ws] Failed to persist assistant message:", err),
					);
				}
			}

			redisPub.publish("typing-events", JSON.stringify({
				type: "ai_completed",
				conversationId: session.conversationId,
			})).catch(() => { });
		}
	} catch (err: any) {

		if (session.generationId !== thisGenerationId) return;

		const classified = classifyAIError(err);

		if (classified.code === "ABORT" || session.abortController?.signal.aborted) {
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
		if (session.generationId === thisGenerationId) {
			session.isStreaming = false;
			session.abortController = null;

			if (session.idlePhase !== 2) {
				if (!isIdleProbe) {
					resetIdleTimer(session, ws);
				}
			}
		}
	}
}



Bun.serve({
	port: PORT,

	async fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === "/metrics" || url.pathname === "/api/metrics") {
			try {
				const { registry } = require("./lib/metrics/prometheus");
				const metricsText = await registry.metrics();
				return new Response(metricsText, {
					headers: {
						"Content-Type": registry.contentType,
					},
				});
			} catch (err) {
				return new Response("Error generating metrics", { status: 500 });
			}
		}

		const model = resolveModel(url.searchParams.get("model"));
		const conversationId = url.searchParams.get("conversationId") || undefined;

		if (server.upgrade(req, { data: { model, conversationId } })) return;
		return new Response("WebSocket upgrade failed", { status: 500 });
	},

	websocket: {
		async open(ws) {
			console.log("[ws] client connected");
			wsConnectionsActive.inc();

			const model = (ws.data as { model: string })?.model || resolveModel(null);
			const conversationId = (ws.data as { conversationId?: string })?.conversationId;

			const session: Session = {
				history: [],
				abortController: null,
				idleTimer: null,
				isStreaming: false,
				partialResponse: "",
				idlePhase: 0,
				hasReceivedUserMessage: !!conversationId,
				model,
				generationId: 0,
				tokenCount: 0,
				typingNudgeTimer: null,
				typingNudgeSent: false,
				isUserTyping: false,
				lastTypingAt: 0,
				lastInterruption: null,
			};
			sessions.set(ws, session);

			if (conversationId) {
				session.conversationId = conversationId;
				console.log(`[ws] Resuming conversation ${conversationId}`);
				try {
					const { getMessages } = await import("./lib/db/queries");
					const dbMsgs = await getMessages(conversationId);
					session.history = dbMsgs.map((m) => ({
						role: m.role,
						content: m.content,
					}));
					console.log(`[ws] Loaded ${session.history.length} messages from history`);
				} catch (err) {
					console.error("[ws] Failed to load messages for conversation:", err);
				}
				resetIdleTimer(session, ws);
			} else {
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

				await streamAIResponse(session, ws, { isGreeting: true });
			}
		},

		async message(ws, raw) {
			const session = sessions.get(ws);
			if (!session) return;

			if (session.idlePhase === 2) return;

			let data: {
				type: string;
				text?: string;
				conversationId?: string;
			};
			try {
				data = JSON.parse(typeof raw === "string" ? raw : raw.toString());
			} catch {
				return;
			}

			if (data.conversationId && !session.conversationId) {
				session.conversationId = data.conversationId;
			}

			if (data.type === "user_typing") {
				const now = Date.now();
				if (now - session.lastTypingAt < 300) return;
				session.lastTypingAt = now;
				session.isUserTyping = true;

				// Start the 30s typing nudge timer
				startTypingNudgeTimer(session, ws);

				// Reset idle timer while user is typing
				resetIdleTimer(session, ws);

				// IMMEDIATELY INTERRUPT if AI is streaming
				if (session.isStreaming && session.abortController) {
					console.log(`[ws] User started typing. Interrupting AI generation for ${session.conversationId}`);
					session.abortController.abort();
					
					session.lastInterruption = {
						partialContent: session.partialResponse,
						interruptedAtToken: session.tokenCount,
						userMessage: "", // Will be filled when they send the message
					};

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
								status: "interrupted",
							}).catch((err) =>
								console.error("[ws] Failed to persist interrupted message:", err),
							);
						}
					}

					// Send the interrupted event to immediately clear the typing/streaming state on the frontend
					send(ws, {
						type: "ai_interrupted",
						partialContent: session.partialResponse?.slice(-200) || "",
						interruptedAtToken: session.tokenCount,
					});

					redisPub.publish("typing-events", JSON.stringify({
						type: "ai_interrupted",
						conversationId: session.conversationId,
					})).catch(() => { });
				}

				return;
			}

			if (data.type === "user_stopped_typing") {
				session.isUserTyping = false;
				session.typingNudgeSent = false;
				clearTypingNudgeTimer(session);
				return;
			}

			if (data.type === "cancel") {
				if (session.isStreaming && session.abortController) {
					session.abortController.abort();
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
								status: "interrupted",
							}).catch((err) =>
								console.error("[ws] Failed to persist interrupted message:", err),
							);
						}
					}

					await sleep(60);
					send(ws, {
						type: "ai_interrupted",
						partialContent: session.partialResponse?.slice(-200) || "",
						interruptedAtToken: session.tokenCount,
					});

					// Publish interruption event
					redisPub.publish("typing-events", JSON.stringify({
						type: "ai_interrupted",
						conversationId: session.conversationId,
					})).catch(() => { });
				}
				return;
			}

			if (data.type !== "user_message" || !data.text) return;

			session.isUserTyping = false;
			session.typingNudgeSent = false;
			clearTypingNudgeTimer(session);

			resetIdleTimer(session, ws);

			// Check if we have a pending typing-based interruption that needs the user message attached
			if (session.lastInterruption && session.lastInterruption.userMessage === "") {
				session.lastInterruption.userMessage = data.text;
			} else if (session.isStreaming && session.abortController) {
				session.abortController.abort();

				session.lastInterruption = {
					partialContent: session.partialResponse,
					interruptedAtToken: session.tokenCount,
					userMessage: data.text,
				};

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
							status: "interrupted",
						}).catch((err) =>
							console.error("[ws] Failed to persist interrupted message:", err),
						);
					}
				}

				await sleep(60);
				send(ws, {
					type: "ai_interrupted",
					partialContent: session.partialResponse?.slice(-200) || "",
					interruptedAtToken: session.tokenCount,
				});

				// Publish interruption event
				redisPub.publish("typing-events", JSON.stringify({
					type: "ai_interrupted",
					conversationId: session.conversationId,
				})).catch(() => { });
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
			wsConnectionsActive.dec();
			const session = sessions.get(ws);
			if (!session) return;

			clearIdleTimer(session);
			clearTypingNudgeTimer(session);
			if (session.abortController) session.abortController.abort();
			sessions.delete(ws);
		},
	},
});

console.log(`[ws] WebSocket server listening on ws://localhost:${PORT}`);
