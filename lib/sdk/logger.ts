export interface TokenUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}

export interface LogPayload {
    model: string;
    provider: string;
    status: 'success' | 'error';
    latencyMs: number;
    tokens?: TokenUsage;
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

function fireLog(payload: LogPayload) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const url = typeof window === 'undefined' ? new URL('/api/ingest', baseUrl).toString() : '/api/ingest';

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    }).catch((error) => {
        console.error('[Logger] Failed to send log to ingestion endpoint:', error);
    });
}


export async function withLogger<T>(
    providerCall: () => Promise<T>,
    options: LoggerOptions,
    extractMetrics?: (response: T) => { tokens?: TokenUsage; outputPreview?: string }
): Promise<T> {
    const startTime = Date.now();

    try {
        const response = await providerCall();

        // Determine if the response is a stream 
        const isObject = response !== null && typeof response === 'object';
        const isReadableStream = isObject && response instanceof ReadableStream;
        const isAsyncIterable = isObject && Symbol.asyncIterator in response;

        // Helper to log success
        const logSuccess = (outputPreview?: string, tokens?: TokenUsage) => {
            const latencyMs = Date.now() - startTime;
            fireLog({
                ...options,
                status: 'success',
                latencyMs,
                outputPreview,
                tokens,
            });
        };

        if (isReadableStream) {
            // Intercept ReadableStream
            const reader = (response as ReadableStream).getReader();
            let fullText = '';

            const stream = new ReadableStream({
                async start(controller) {
                    try {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                logSuccess(fullText.substring(0, 1000));
                                controller.close();
                                break;
                            }

                            // Try to accumulate text for preview
                            if (value instanceof Uint8Array) {
                                fullText += new TextDecoder().decode(value);
                            } else if (typeof value === 'string') {
                                fullText += value;
                            } else if (value && typeof (value as any).text === 'string') {
                                fullText += (value as any).text;
                            }

                            controller.enqueue(value);
                        }
                    } catch (error: any) {
                        const latencyMs = Date.now() - startTime;
                        fireLog({
                            ...options,
                            status: 'error',
                            latencyMs,
                            error: error.message || String(error),
                        });
                        controller.error(error);
                    }
                }
            });
            return stream as any as T;

        } else if (isAsyncIterable) {
            const asyncIterable = response as any as AsyncIterable<any>;
            const originalIterator = asyncIterable[Symbol.asyncIterator]();

            const wrappedIterable = {
                [Symbol.asyncIterator]() {
                    let fullText = '';
                    return {
                        async next() {
                            try {
                                const result = await originalIterator.next();
                                if (result.done) {
                                    logSuccess(fullText.substring(0, 1000));
                                    return result;
                                }
                                if (typeof result.value === 'string') {
                                    fullText += result.value;
                                } else if (result.value && typeof result.value.text === 'string') {
                                    fullText += result.value.text;
                                }

                                return result;
                            } catch (error: any) {
                                const latencyMs = Date.now() - startTime;
                                fireLog({
                                    ...options,
                                    status: 'error',
                                    latencyMs,
                                    error: error.message || String(error),
                                });
                                throw error;
                            }
                        }
                    };
                }
            };
            return wrappedIterable as any as T;

        } else {
            let metrics = {};
            if (extractMetrics) {
                metrics = extractMetrics(response);
            } else if (isObject && typeof (response as any).text === 'string') {
                metrics = { outputPreview: (response as any).text.substring(0, 1000) };
            }

            logSuccess((metrics as any).outputPreview, (metrics as any).tokens);
        }

        return response;
    } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        fireLog({
            ...options,
            status: 'error',
            latencyMs,
            error: error.message || String(error),
        });

        throw error;
    }
}
