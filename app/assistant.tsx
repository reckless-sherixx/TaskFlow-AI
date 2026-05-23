"use client";

import type { AppendMessage, ThreadMessage } from "@assistant-ui/react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Thread } from "@/components/thread";
import { ThreadListSidebar } from "@/components/threadlist-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DEFAULT_MODEL, MODEL_LABELS, VALID_MODELS } from "@/lib/ai/models";
import {
  useConversationStore,
  type ConversationMeta,
} from "@/lib/store/conversation-store";

// ── Types ─────────────────────────────────────────────

export type GeminiModelId = string;

export type TokenStats = {
  used: number;
  total: number;
};

// ── Helpers ───────────────────────────────────────────

let _idCounter = 0;
function generateId() {
  return `msg-${Date.now()}-${++_idCounter}`;
}

// ── WebSocket Chat Hook ───────────────────────────────

function useWebSocketChat(conversationModel: string) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ used: 0, total: 1_000_000 });
  const wsRef = useRef<WebSocket | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const assistantTextRef = useRef("");

  const store = useConversationStore();

  // Track connection identity so we can reconnect
  const [wsKey, setWsKey] = useState(() => generateId());

  const connect = useCallback((model: string) => {
    setMessages([]);
    setTokenStats({ used: 0, total: 1_000_000 });
    conversationIdRef.current = null;
    setWsKey(generateId());
  }, []);

  useEffect(() => {
    // Model is sent via URL param — eliminates race condition
    const wsUrl = `ws://${window.location.hostname}:8080?model=${encodeURIComponent(conversationModel)}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("connected");
    };

    ws.onmessage = (event) => {
      let data: {
        type: string;
        token?: string;
        error?: string;
        code?: string;
        conversationId?: string;
        reason?: string;
        status?: string;
        tokensUsed?: number;
        model?: string;
        title?: string;
      };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {
        case "conversation_created": {
          if (data.conversationId) {
            conversationIdRef.current = data.conversationId;

            // Add to the sidebar store
            store.upsertConversation({
              id: data.conversationId,
              title: "New Conversation",
              model: data.model || conversationModel,
              status: "active",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastMessagePreview: null,
              messageCount: 0,
            });
            store.setActive(data.conversationId);
          }
          break;
        }

        case "title_updated": {
          if (data.conversationId && data.title) {
            store.updateTitle(data.conversationId, data.title);
          }
          break;
        }

        case "ai_start": {
          setIsRunning(true);
          assistantTextRef.current = "";
          const newId = generateId();
          currentAssistantIdRef.current = newId;
          setMessages((prev) => [
            ...prev,
            {
              id: newId,
              role: "assistant",
              content: [{ type: "text", text: "" }],
              createdAt: new Date(),
              status: { type: "running" },
              attachments: [],
              metadata: {},
            } as unknown as ThreadMessage,
          ]);
          break;
        }

        case "ai_token": {
          if (!data.token) break;
          assistantTextRef.current += data.token;
          const targetId = currentAssistantIdRef.current;
          const incoming = data.token;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== targetId) return msg;
              const content = msg.content.map((part) =>
                part.type === "text"
                  ? { ...part, text: part.text + incoming }
                  : part,
              );
              return { ...msg, content } as unknown as ThreadMessage;
            }),
          );
          break;
        }

        case "ai_done": {
          setIsRunning(false);
          const doneId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;

          if (data.tokensUsed !== undefined) {
            setTokenStats((prev) => ({
              ...prev,
              used: prev.used + (data.tokensUsed ?? 0),
            }));
          }

          if (conversationIdRef.current && assistantTextRef.current) {
            store.updatePreview(conversationIdRef.current, assistantTextRef.current);
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === doneId
                ? ({
                  ...msg,
                  status: { type: "complete", reason: "stop" },
                } as unknown as ThreadMessage)
                : msg,
            ),
          );
          break;
        }

        case "ai_interrupted": {
          setIsRunning(false);
          const interruptedId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;

          if (conversationIdRef.current && assistantTextRef.current) {
            store.updatePreview(conversationIdRef.current, assistantTextRef.current);
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === interruptedId
                ? ({
                  ...msg,
                  status: { type: "complete", reason: "stop" },
                } as unknown as ThreadMessage)
                : msg,
            ),
          );
          break;
        }

        case "ai_error": {
          setIsRunning(false);
          const errorId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          const errMsg = data.error ?? "Something went wrong.";
          console.error("AI error:", errMsg, "code:", data.code);

          if (errorId) {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== errorId) return msg;
                const content = msg.content.map((part) =>
                  part.type === "text"
                    ? { ...part, text: errMsg }
                    : part,
                );
                return {
                  ...msg,
                  content,
                  status: { type: "complete", reason: "error" },
                } as unknown as ThreadMessage;
              }),
            );
          }
          break;
        }

        case "conversation_ended": {
          setIsRunning(false);
          currentAssistantIdRef.current = null;
          setMessages((prev) => [
            ...prev,
            {
              id: generateId(),
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: "This conversation has ended due to inactivity. Feel free to start a new one!",
                },
              ],
              createdAt: new Date(),
              status: { type: "complete", reason: "stop" },
              attachments: [],
              metadata: {},
            } as unknown as ThreadMessage,
          ]);
          break;
        }
      }
    };

    ws.onclose = () => {
      console.log("disconnected");
      setIsRunning(false);
    };

    return () => {
      ws.close();
    };
  }, [wsKey]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const textPart = message.content.find((c) => c.type === "text");
    const text = textPart && textPart.type === "text" ? textPart.text : "";
    if (!text.trim()) return;

    const userMsg = {
      id: generateId(),
      role: "user",
      content: [{ type: "text", text }],
      createdAt: new Date(),
      attachments: [],
      metadata: {},
    } as unknown as ThreadMessage;
    setMessages((prev) => [...prev, userMsg]);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "user_message",
          text,
          conversationId: conversationIdRef.current,
        }),
      );
    }
  }, []);

  const onCancel = useCallback(async () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel" }));
    }
  }, []);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    onCancel,
    adapters: {
      threadList: {
        onSwitchToNewThread: async () => {
          // Will be handled by startNewThread in the parent
        },
      },
    },
  });

  return { runtime, tokenStats, connect, setMessages, conversationIdRef };
}

// ── Main Component ────────────────────────────────────

export const Assistant = () => {
  const [selectedModel, setSelectedModel] = useState<GeminiModelId>(DEFAULT_MODEL);
  const [isDark, setIsDark] = useState(false);
  const store = useConversationStore();

  // Apply dark mode to <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  // Detect system preference on mount
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
  }, []);

  // Hydrate sidebar from DB on mount
  useEffect(() => {
    if (store.hydrated) return;

    fetch("/api/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && Array.isArray(data.conversations)) {
          store.setConversations(
            data.conversations.map((c: any) => ({
              id: c.id,
              title: c.title || "New Conversation",
              model: c.model || DEFAULT_MODEL,
              status: c.status || "active",
              createdAt: c.createdAt,
              updatedAt: c.updatedAt,
              lastMessagePreview: c.lastMessagePreview || null,
              messageCount: c.messageCount || 0,
            })),
          );
        } else {
          store.markHydrated();
        }
      })
      .catch((err) => {
        console.error("[hydration] Failed to load conversations:", err);
        store.markHydrated();
      });
  }, []);

  // For new conversations, use the selected model.
  // For resumed conversations, use the conversation's persisted model.
  const activeConv = store.conversations.find((c) => c.id === store.activeId);
  const conversationModel = activeConv?.model || selectedModel;

  const { runtime, tokenStats, connect, setMessages, conversationIdRef } =
    useWebSocketChat(conversationModel);

  // Start a brand new conversation with the currently selected model
  const startNewThread = useCallback(() => {
    connect(selectedModel);
  }, [connect, selectedModel]);

  // Switch to an existing conversation — load messages from DB
  const switchToConversation = useCallback(
    async (convId: string) => {
      store.setActive(convId);

      try {
        const res = await fetch(`/api/conversations/${convId}`);
        const data = await res.json();

        if (data.success && data.conversation) {
          const conv = data.conversation;
          const loadedMessages: ThreadMessage[] = conv.messages.map(
            (m: any) => ({
              id: m.id,
              role: m.role,
              content: [{ type: "text", text: m.content }],
              createdAt: new Date(m.createdAt),
              status: { type: "complete", reason: "stop" },
              attachments: [],
              metadata: {},
            }),
          );
          setMessages(loadedMessages);
          conversationIdRef.current = convId;
        }
      } catch (err) {
        console.error("[switch] Failed to load conversation:", err);
      }
    },
    [setMessages, conversationIdRef],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar
            tokenStats={tokenStats}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            isDark={isDark}
            onToggleDark={() => setIsDark((d) => !d)}
            onNewThread={startNewThread}
            onSwitchConversation={switchToConversation}
          />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="#">Taskflow AI</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>
                      {activeConv?.title || "A Conversational AI"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </header>
            <div className="flex-1 overflow-hidden">
              <Thread />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
