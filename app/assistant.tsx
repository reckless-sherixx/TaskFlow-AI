"use client";

import type { AppendMessage, ThreadMessage } from "@assistant-ui/react";
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
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


export type ModelId = string;

export type TokenStats = {
  used: number;
  total: number;
};

let _idCounter = 0;
function generateId() {
  return `msg-${Date.now()}-${++_idCounter}`;
}

function useWebSocketChat(conversationModel: string, activeId: string | null) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isAiStreaming, setIsAiStreaming] = useState(false);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ used: 0, total: 50_000 });
  const wsRef = useRef<WebSocket | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const connectedConversationIdRef = useRef<string | null>(null);
  const currentAssistantIdRef = useRef<string | null>(null);
  const assistantTextRef = useRef("");

  // Typing event refs
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingSentRef = useRef(false);

  const store = useConversationStore();

  // Track connection identity to reconnect
  const [wsKey, setWsKey] = useState<string | null>(null);

  const connect = useCallback((model: string) => {
    setMessages([]);
    setTokenStats({ used: 0, total: 50_000 });
    setIsAiTyping(false);
    setIsAiStreaming(false);
    conversationIdRef.current = null;
    connectedConversationIdRef.current = null;
    setWsKey(generateId());
  }, []);

  const sendTypingEvent = useCallback((type: "user_typing" | "user_stopped_typing") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type,
        conversationId: conversationIdRef.current,
      }));
    }
  }, []);

  const notifyTyping = useCallback(() => {
    // Send typing event 
    if (!isTypingSentRef.current) {
      isTypingSentRef.current = true;
      sendTypingEvent("user_typing");
      store.setUserTyping(true);
    }

    // Reset the stop-typing timer
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      isTypingSentRef.current = false;
      sendTypingEvent("user_stopped_typing");
      store.setUserTyping(false);
    }, 2000);
  }, [sendTypingEvent, store]);

  // Cleanup typing timer on unmount
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
      }
    };
  }, []);

  // Sync activeId changes from outside
  useEffect(() => {
    if (activeId !== connectedConversationIdRef.current) {
      connectedConversationIdRef.current = activeId;
      conversationIdRef.current = activeId;
      if (activeId) {
        setWsKey(generateId());
      } else {
        setWsKey(null);
      }
    }
  }, [activeId]);

  useEffect(() => {
    if (!wsKey) return;
    const targetId = connectedConversationIdRef.current;
    const idParam = targetId ? `&conversationId=${encodeURIComponent(targetId)}` : "";
    const wsUrl = `ws://${window.location.hostname}:8080?model=${encodeURIComponent(conversationModel)}${idParam}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);
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
        message?: string;
        partialContent?: string;
        interruptedAtToken?: number;
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
            connectedConversationIdRef.current = data.conversationId;

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
          setIsAiTyping(true);
          setIsAiStreaming(false);
          store.setAiTyping(true);
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
          // Transition from "typing" to "streaming" on first token
          if (isAiTyping) {
            setIsAiTyping(false);
            setIsAiStreaming(true);
          }
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
          setIsAiTyping(false);
          setIsAiStreaming(false);
          store.setAiTyping(false);
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
          setIsAiTyping(false);
          setIsAiStreaming(false);
          store.setAiTyping(false);
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
                  metadata: {
                    ...((msg as any).metadata || {}),
                    interrupted: true,
                    interruptedAtToken: data.interruptedAtToken,
                  },
                } as unknown as ThreadMessage)
                : msg,
            ),
          );
          break;
        }

        case "typing_nudge": {
          if (data.message) {
            const nudgeId = generateId();
            setMessages((prev) => [
              ...prev,
              {
                id: nudgeId,
                role: "assistant",
                content: [{ type: "text", text: data.message }],
                createdAt: new Date(),
                status: { type: "complete", reason: "stop" },
                attachments: [],
                metadata: { isNudge: true },
              } as unknown as ThreadMessage,
            ]);
          }
          break;
        }

        case "ai_error": {
          setIsRunning(false);
          setIsAiTyping(false);
          setIsAiStreaming(false);
          store.setAiTyping(false);
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
          setIsAiTyping(false);
          setIsAiStreaming(false);
          store.setAiTyping(false);
          currentAssistantIdRef.current = null;

          const targetConvId = data.conversationId || conversationIdRef.current;
          if (targetConvId) {
            store.updateStatus(targetConvId, "completed");
          }

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

        case "conversation_cancelled": {
          if (data.conversationId) {
            store.updateStatus(data.conversationId, "cancelled");
          }
          break;
        }

        case "conversation_resumed": {
          if (data.conversationId) {
            store.updateStatus(data.conversationId, "active");
          }
          break;
        }
      }
    };

    ws.onclose = () => {
      console.log("disconnected");
      setIsRunning(false);
      setIsAiTyping(false);
      setIsAiStreaming(false);
      store.setAiTyping(false);
    };

    return () => {
      ws.close();
    };
  }, [wsKey, conversationModel]);

  const onNew = useCallback(async (message: AppendMessage) => {
    const textPart = message.content.find((c) => c.type === "text");
    const text = textPart && textPart.type === "text" ? textPart.text : "";
    if (!text.trim()) return;

    // Prevent sending if conversation is cancelled or completed
    const state = useConversationStore.getState();
    const activeConv = state.conversations.find((c) => c.id === state.activeId);
    if (activeConv && activeConv.status !== "active") {
      return;
    }

    // Clear typing state on send
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    isTypingSentRef.current = false;
    store.setUserTyping(false);

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
  }, [store]);

  const onCancel = useCallback(async () => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel" }));
    }
  }, []);

  const cancelConversation = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel_conversation" }));
    }
  }, []);

  const resumeConversation = useCallback((convId: string) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "resume_conversation", conversationId: convId }));
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

  return {
    runtime,
    tokenStats,
    connect,
    setMessages,
    conversationIdRef,
    isAiTyping,
    isAiStreaming,
    notifyTyping,
    cancelConversation,
    resumeConversation,
    wsKey,
  };
}


export const Assistant = () => {
  const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
  const [isDark, setIsDark] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const store = useConversationStore();

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDark(mq.matches);
  }, []);

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

  const {
    runtime,
    tokenStats,
    connect,
    setMessages,
    conversationIdRef,
    isAiTyping,
    isAiStreaming,
    notifyTyping,
    cancelConversation,
    resumeConversation,
    wsKey,
  } = useWebSocketChat(conversationModel, store.activeId);

  const prepareNewThread = useCallback(() => {
    store.setActive(null);
  }, [store]);

  const startChat = useCallback(() => {
    connect(selectedModel);
  }, [connect, selectedModel]);
  const switchToConversation = useCallback(
    async (convId: string) => {
      store.setActive(convId);
      setIsChatLoading(true);

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
              metadata: {
                ...(m.status === "interrupted" ? { interrupted: true } : {}),
              },
            }),
          );
          setMessages(loadedMessages);
          conversationIdRef.current = convId;
        }
      } catch (err) {
        console.error("Failed to load conversation:", err);
      } finally {
        setIsChatLoading(false);
      }
    },
    [setMessages],
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
            onNewThread={prepareNewThread}
            onSwitchConversation={switchToConversation}
            onCancelConversation={cancelConversation}
            onResumeConversation={resumeConversation}
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
              {!activeConv && !wsKey ? (
                <div className="flex h-full flex-col items-center justify-center space-y-4">
                  <div className="rounded-full bg-primary/10 p-4">
                    <MessagesSquare className="size-8 text-primary" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">Welcome to TaskFlow AI</h2>
                  <p className="text-muted-foreground text-center max-w-[400px]">
                    Start a new conversation to explore ideas, ask questions, or just chat.
                  </p>
                  <Button onClick={startChat} size="lg" className="mt-4 cursor-pointer">
                    Start Chat
                  </Button>
                </div>
              ) : (
                <Thread
                  isAiTyping={isAiTyping}
                  isAiStreaming={isAiStreaming}
                  isLoadingChat={isChatLoading}
                  disabled={activeConv ? activeConv.status !== "active" : false}
                  onComposerInput={notifyTyping}
                />
              )}
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProvider>
  );
};
