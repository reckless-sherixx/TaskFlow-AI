"use client";

import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
} from "@assistant-ui/react";
import type { ThreadMessage, AppendMessage } from "@assistant-ui/react";
import { Thread } from "@/components/thread";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ThreadListSidebar } from "@/components/threadlist-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useEffect, useRef, useState, useCallback } from "react";

let _idCounter = 0;
function generateId() {
  return `msg-${Date.now()}-${++_idCounter}`;
}

function useWebSocketChat() {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [threadId, setThreadId] = useState(() => generateId());
  const wsRef = useRef<WebSocket | null>(null);

  const currentAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {

    const wsUrl = `ws://${window.location.hostname}:8080`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[ws] connected");
    };

    ws.onmessage = (event) => {
      let data: { type: string; token?: string; error?: string };
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (data.type) {

        case "ai_start": {
          setIsRunning(true);
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
          const targetId = currentAssistantIdRef.current;
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== targetId) return msg;
              const content = [...msg.content];
              const first = content[0];
              if (first && first.type === "text") {
                content[0] = { ...first, text: first.text + data.token };
              }
              return { ...msg, content } as unknown as ThreadMessage;
            }),
          );
          break;
        }

        case "ai_done": {
          setIsRunning(false);
          const doneId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === doneId
                ? ({ ...msg, status: { type: "complete", reason: "stop" } } as unknown as ThreadMessage)
                : msg,
            ),
          );
          break;
        }

        case "ai_interrupted": {
          setIsRunning(false);
          const interruptedId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === interruptedId
                ? ({ ...msg, status: { type: "complete", reason: "stop" } } as unknown as ThreadMessage)
                : msg,
            ),
          );
          break;
        }

        case "ai_error": {
          setIsRunning(false);
          const errorId = currentAssistantIdRef.current;
          currentAssistantIdRef.current = null;
          console.error("[ws] AI error:", data.error);
          
          if (errorId) {
            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== errorId) return msg;
                const content = [...msg.content];
                const first = content[0];
                if (first && first.type === "text") {
                  content[0] = { ...first, text: first.text + `\n\n[System Error: ${data.error}]` };
                }
                return { ...msg, content, status: { type: "complete", reason: "error" } } as unknown as ThreadMessage;
              }),
            );
          }
          break;
        }
      }
    };

    ws.onclose = () => {
      console.log("[ws] disconnected");
      setIsRunning(false);
    };

    return () => {
      ws.close();
    };
  }, [threadId]);

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
      ws.send(JSON.stringify({ type: "user_message", text }));
    }
  }, []);

  const onCancel = useCallback(async () => {


    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "cancel" }));
    }
  }, []);

  return useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    onCancel,
    adapters: {
      threadList: {
        onSwitchToNewThread: async () => {
          setMessages([]);
          setThreadId(generateId());
        },
      },
    },
  });
}

export const Assistant = () => {
  const runtime = useWebSocketChat();

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <SidebarProvider>
        <div className="flex h-dvh w-full pr-0.5">
          <ThreadListSidebar />
          <SidebarInset>
            <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
              <SidebarTrigger />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="#"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Taskflow AI
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    <BreadcrumbPage>A Conversational AI</BreadcrumbPage>
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
