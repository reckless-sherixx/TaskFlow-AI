// @ts-nocheck
import { google } from "@ai-sdk/google";
import { type CoreMessage, streamText } from "ai";
import Redis from "ioredis";
import { withLogger } from "./lib/sdk/logger";

const PORT = 8080;

type Session = {
	history: CoreMessage[];
	abortController: AbortController | null;
	idleTimer: ReturnType<typeof setTimeout> | null;
	isStreaming: boolean;
	partialResponse: string;
	conversationId?: string;
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
	"You are a warm, conversational AI assistant called Taskflow. " +
	"You speak naturally like a real person on a phone call — concise, friendly, and helpful. " +
	"When the conversation starts, greet the user warmly to start the call.";

const IDLE_PROMPT =
	"The user has been silent for 15 seconds. " +
	"Gently check if they're still there with a short, natural message.";

const IDLE_TIMEOUT_MS = 15_000;
const TOKEN_DELAY_MS = 35; // 30-50 ms artificial delay per token

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function send(ws: any, payload: object) {
	try {
		ws.send(JSON.stringify(payload));
	} catch {}
}

function resetIdleTimer(session: Session, ws: any) {
	if (session.idleTimer) clearTimeout(session.idleTimer);

	session.idleTimer = setTimeout(() => {
		if (!session.isStreaming) {
			streamAIResponse(session, ws, true);
		}
	}, IDLE_TIMEOUT_MS);
}

async function streamAIResponse(
	session: Session,
	ws: any,
	isIdleProbe = false,
) {
	session.isStreaming = true;
	session.abortController = new AbortController();
	session.partialResponse = "";

	const messages: CoreMessage[] = [...session.history];

	if (isIdleProbe) {
		messages.push({ role: "user", content: IDLE_PROMPT });
	}

	if (messages.length === 0) {
		messages.push({ role: "user", content: "Hello" });
	}

	send(ws, { type: "ai_start" });

	try {
		const result = await withLogger(
			async () =>
				streamText({
					model: google("gemini-3.5-flash"),
					system: SYSTEM_PROMPT,
					messages,
					abortSignal: session.abortController.signal,
				}),
			{
				model: "gemini-3.5-flash",
				provider: "google",
				conversationId: session.conversationId,
				inputPreview: messages[messages.length - 1]?.content as string,
			},
		);

		for await (const chunk of result.textStream) {
			if (session.abortController.signal.aborted) break;

			session.partialResponse += chunk;
			send(ws, { type: "ai_token", token: chunk });
			await sleep(TOKEN_DELAY_MS);
		}

		if (!session.abortController.signal.aborted) {
			send(ws, { type: "ai_done" });
			session.history.push({
				role: "assistant",
				content: session.partialResponse,
			});
		}
	} catch (err: any) {
		if (err.name !== "AbortError" && !session.abortController.signal.aborted) {
			console.error("AI stream error:", err);
			send(ws, { type: "ai_error", error: String(err) });
		}
	} finally {
		session.isStreaming = false;
		session.abortController = null;

		resetIdleTimer(session, ws);
	}
}

Bun.serve({
	port: PORT,

	fetch(req, server) {
		if (server.upgrade(req)) return;
		return new Response("WebSocket upgrade failed", { status: 500 });
	},

	websocket: {
		open(ws) {
			console.log("[ws] client connected");

			const session: Session = {
				history: [],
				abortController: null,
				idleTimer: null,
				isStreaming: false,
				partialResponse: "",
			};
			sessions.set(ws, session);

			streamAIResponse(session, ws);
		},

		async message(ws, raw) {
			const session = sessions.get(ws);
			if (!session) return;

			let data: { type: string; text?: string; conversationId?: string };
			try {
				data = JSON.parse(typeof raw === "string" ? raw : raw.toString());
			} catch {
				return; // ignore malformed frames
			}

			if (data.conversationId) {
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
						content: `[interrupted at: "${session.partialResponse}"]`,
					});
				}

				await sleep(60);

				send(ws, { type: "ai_interrupted" });
			}

			session.history.push({ role: "user", content: data.text });

			streamAIResponse(session, ws);
		},

		close(ws) {
			console.log("[ws] client disconnected");
			const session = sessions.get(ws);
			if (!session) return;

			if (session.idleTimer) clearTimeout(session.idleTimer);
			if (session.abortController) session.abortController.abort();
			sessions.delete(ws);
		},
	},
});

console.log(`[ws] WebSocket server listening on ws://localhost:${PORT}`);
