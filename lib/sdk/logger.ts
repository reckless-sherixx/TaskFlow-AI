export interface LogPayload {
    model: string;
    provider: string;
    status: "success" | "error";
    latencyMs: number;
    tokens?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
    sessionId?: string;
    conversationId?: string;
    inputPreview?: string;
    outputPreview?: string;
    error?: string;
}

export interface LoggerOptions {
    model: string;
    provider: string;
    sessionId?: string;
    conversationId?: string;
    inputPreview?: string;
}

import { llmRequestsTotal, llmLatencyMs } from "../metrics/prometheus";

const getIngestUrl = () => {
    if (typeof window !== "undefined") return "/api/ingest";
    const base =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : "http://localhost:3000");
    return new URL("/api/ingest", base).toString();
};

function sendLog(payload: LogPayload) {
    fetch(getIngestUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    }).catch((err) => {
        console.error("Logging failed:", err);
    });
}

export async function withLogger<T>(
    fn: () => Promise<T>,
    options: LoggerOptions,
): Promise<T> {
    const start = Date.now();

    const report = (status: "success" | "error", extra?: Partial<LogPayload>) => {
        const latency = Date.now() - start;
        
        // Prometheus metrics
        llmRequestsTotal.inc({ model: options.model, provider: options.provider, status });
        llmLatencyMs.observe({ model: options.model }, latency);

        sendLog({
            ...options,
            status,
            latencyMs: latency,
            ...extra,
        });
    };

    try {
        const res = await fn();

        if (res && typeof res === "object") {
            if ("textStream" in res && res.textStream) {
                const streamContainer = res as { textStream: AsyncIterable<string> };
                const originalStream = streamContainer.textStream;
                let fullText = "";

                return new Proxy(res, {
                    get(target: any, prop: string | symbol, receiver: any) {
                        if (prop === "textStream") {
                            return {
                                async *[Symbol.asyncIterator]() {
                                    try {
                                        for await (const chunk of originalStream) {
                                            fullText += chunk;
                                            yield chunk;
                                        }
                                        report("success", { outputPreview: fullText });
                                    } catch (err) {
                                        report("error", {
                                            error: err instanceof Error ? err.message : String(err),
                                        });
                                        throw err;
                                    }
                                },
                            };
                        }
                        return Reflect.get(target, prop, receiver);
                    },
                }) as T;
            }
        }

        // Standard web ReadableStream
        if (res instanceof ReadableStream) {
            const reader = res.getReader();
            let fullText = "";
            const decoder = new TextDecoder();

            return new ReadableStream({
                async start(controller) {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                report("success", { outputPreview: fullText });
                                controller.close();
                                break;
                            }

                            const chunk =
                                typeof value === "string"
                                    ? value
                                    : decoder.decode(value, { stream: true });
                            fullText += chunk;
                            controller.enqueue(value);
                        }
                    } catch (err) {
                        report("error", {
                            error: err instanceof Error ? err.message : String(err),
                        });
                        controller.error(err);
                    }
                },
            }) as unknown as T;
        }

        // Standard response (non-stream)
        let outputPreview: string | undefined;
        let tokens: LogPayload["tokens"];

        if (res && typeof res === "object") {
            const obj = res as Record<string, unknown>;

            if (typeof obj.text === "string") {
                outputPreview = obj.text;
            }

            const usage = obj.usage as Record<string, unknown> | undefined;
            if (usage && typeof usage === "object") {
                tokens = {
                    promptTokens:
                        typeof usage.promptTokens === "number"
                            ? usage.promptTokens
                            : undefined,
                    completionTokens:
                        typeof usage.completionTokens === "number"
                            ? usage.completionTokens
                            : undefined,
                    totalTokens:
                        typeof usage.totalTokens === "number"
                            ? usage.totalTokens
                            : undefined,
                };
            }
        }

        report("success", { outputPreview, tokens });
        return res;
    } catch (err) {
        report("error", {
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
}
