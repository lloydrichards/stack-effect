// Client chat RPC client
export const clientChatRpcClientContents = `import { ChatRpc } from "@repo/domain/ChatRpc";
import { Context, Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  RpcClient as EffectRpcClient,
  RpcSerialization,
} from "effect/unstable/rpc";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";

const ProtocolLive = EffectRpcClient.layerProtocolHttp({
  url: \`\${SERVER_URL}/chat-rpc\`,
}).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(RpcSerialization.layerNdjson),
);

export class ChatRpcClient extends Context.Service<ChatRpcClient>()("ChatRpcClient", {
  make: Effect.gen(function* () {
    return {
      client: yield* EffectRpcClient.make(ChatRpc),
    } as const;
  }),
}) {
  static layer = Layer.effect(ChatRpcClient)(ChatRpcClient.make).pipe(
    Layer.provide(ProtocolLive),
  );
}
`;

// Client chat atom (uses ChatRpcClient instead of RpcClient)
export const clientChatAtomContents = `import { ChatStreamPart, type ChatId, type ChatMessage, type ChatResponse, type ToolCall } from "@repo/domain/Chat";
import { Effect, Stream } from "effect";
import { Atom, type Atom as AtomType } from "effect/unstable/reactivity";
import { ChatRpcClient } from "../chat-rpc-client";

const chatRuntime = Atom.runtime(ChatRpcClient.layer);

export const chatStartAtom: AtomType.AtomResultFn<
  void,
  { readonly chatId: ChatId },
  unknown
> = chatRuntime.fn(() =>
  Effect.gen(function* () {
    const rpc = yield* ChatRpcClient;
    return yield* rpc.client.chat_start();
  }),
);

export const accumulateChatResponse = (
  state: ChatResponse,
  part: ChatStreamPart,
): ChatResponse =>
  ChatStreamPart.match(part, {
    text: (part) => {
      const currentSegments = state._tag === "initial" ? [] : state.segments;
      const lastSegment = currentSegments[currentSegments.length - 1];

      if (lastSegment?._tag === "text") {
        return {
          _tag: "streaming",
          segments: [
            ...currentSegments.slice(0, -1),
            {
              _tag: "text",
              content: lastSegment.content + part.delta,
              isComplete: true,
            },
          ],
          reasoning: state._tag === "streaming" ? state.reasoning : undefined,
        };
      }

      return {
        _tag: "streaming",
        segments: [
          ...currentSegments,
          {
            _tag: "text",
            content: part.delta,
            isComplete: true,
          },
        ],
        reasoning: state._tag === "streaming" ? state.reasoning : undefined,
      };
    },

    reasoning: (part) => {
      const currentSegments = state._tag === "initial" ? [] : state.segments;
      return {
        _tag: "streaming",
        segments: currentSegments,
        reasoning:
          (state._tag === "streaming" ? state.reasoning ?? "" : "") +
          part.delta,
      };
    },

    "tool-start": (part) => {
      const currentSegments = state._tag === "initial" ? [] : state.segments;
      return {
        _tag: "streaming",
        segments: [
          ...currentSegments,
          {
            _tag: "tool-call",
                  tool: {
                    id: part.id,
                    name: part.name,
                    status: "running",
                    ...(part.input === undefined ? {} : { input: part.input }),
                  },
                },
        ],
        reasoning: state._tag === "streaming" ? state.reasoning : undefined,
      };
    },

    "tool-success": (part) => updateToolResult(state, {
      id: part.id,
      status: "complete",
      result: part.output,
    }),

    "tool-failure": (part) => updateToolResult(state, {
      id: part.id,
      status: "failed",
      result: part.error,
    }),

    finish: (part) => {
      const segments = state._tag === "streaming" ? state.segments : [];
      return {
        _tag: "complete",
        segments,
        usage: part.usage,
        finishReason: part.reason,
      };
    },

    error: (part) => {
      console.error("[chatAtom] Chat stream error received:", part);
      const segments = state._tag === "streaming" ? state.segments : [];
      return {
        _tag: "error",
        segments,
        error: {
          message: part.message,
          recoverable: part.recoverable,
        },
      };
    },
  });

const updateToolResult = (
  state: ChatResponse,
  update: {
    id: string;
    status: ToolCall["status"];
    result: string;
  },
): ChatResponse => {
      if (state._tag !== "streaming") return state;
      return {
        ...state,
        segments: state.segments.map((seg) =>
          seg._tag === "tool-call" && seg.tool.id === update.id
            ? {
                ...seg,
                tool: {
                  ...seg.tool,
                  status: update.status,
                  result: update.result,
                },
              }
            : seg,
        ),
      };
};

export const chatAtom: AtomType.AtomResultFn<
  {
    readonly chatId: ChatId;
    readonly messages: readonly ChatMessage[];
  },
  ChatResponse,
  unknown
> = chatRuntime.fn(({ chatId, messages }) => {
  return Stream.unwrap(
    Effect.gen(function* () {
      const rpc = yield* ChatRpcClient;
      return rpc.client.chat_ask({ chatId, messages });
    }),
  ).pipe(
    Stream.tapError((error: unknown) =>
      Effect.logError("[chatAtom] Stream error occurred:", error),
    ),
    Stream.scan(
      {
        _tag: "initial",
      },
      accumulateChatResponse,
    ),
    Stream.drop(1),
    Stream.catch((error: unknown) => {
      console.error("[chatAtom] Caught unhandled stream error:", error);
      const errorMessage =
        error instanceof Error
          ? \`Stream failed: \${error.message}\`
          : \`Stream failed: \${String(error)}\`;
      return Stream.make({
        _tag: "error" as const,
        segments: [],
        error: {
          message: errorMessage,
          recoverable: false,
        },
      } as ChatResponse);
    }),
  );
});
`;

// Client chat box component (unchanged from before)
export const clientChatBoxContents = `import { useAtom } from "@effect/atom-react";
import type { ChatId, ChatResponse, MessageSegment } from "@repo/domain/Chat";
import { AsyncResult } from "effect/unstable/reactivity";
import { useEffect, useMemo, useRef, useState } from "react";
import { chatAtom, chatStartAtom } from "@/lib/atoms/chat-atom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Message = {
  role: "user" | "assistant" | "system";
  message: string;
  segments?: readonly MessageSegment[];
  usage?:
    | {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      }
    | undefined;
  finishReason?: string | undefined;
};

export function ChatBox() {
  const [result, runChat] = useAtom(chatAtom);
  const [startResult, startChat] = useAtom(chatStartAtom);
  const [chatId, setChatId] = useState<ChatId | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Message[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastSentMessagesRef = useRef<
    Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>
  >([]);
  const pendingMessagesRef = useRef<typeof lastSentMessagesRef.current | null>(
    null,
  );
  const readinessAttemptRef = useRef(0);
  const lastCompletionKeyRef = useRef<string | null>(null);

  const currentResult: ChatResponse = AsyncResult.getOrElse(
    result,
    () => ({ _tag: "initial" }) as const,
  );

  const currentSegments =
    currentResult._tag === "initial" ? [] : currentResult.segments;

  const isWaiting = AsyncResult.isWaiting(result);
  const isStarting = AsyncResult.isWaiting(startResult);
  const isFailure = AsyncResult.isFailure(result);
  const isStreaming = currentResult._tag === "streaming";

  useEffect(() => {
    const started = AsyncResult.getOrElse(startResult, () => null);
    if (!started) return;
    setChatId(started.chatId);
    const pending = pendingMessagesRef.current;
    if (!pending) return;
    pendingMessagesRef.current = null;
    runChat({ chatId: started.chatId, messages: pending });
  }, [runChat, startResult]);

  const sendMessages = (
    messages: Array<{
      role: "user" | "assistant" | "system";
      content: string;
    }>,
  ) => {
    lastSentMessagesRef.current = messages;
    readinessAttemptRef.current = 0;
    if (chatId) {
      runChat({ chatId, messages });
      return;
    }
    pendingMessagesRef.current = messages;
    startChat();
  };

  useEffect(() => {
    if (!isFailure) return;
    if (currentResult._tag !== "error" || !currentResult.error.recoverable) {
      return;
    }
    if (lastSentMessagesRef.current.length === 0) return;
    if (readinessAttemptRef.current >= 3) return;

    readinessAttemptRef.current += 1;
    const timeoutId = window.setTimeout(() => {
      if (chatId) {
        runChat({ chatId, messages: lastSentMessagesRef.current });
        return;
      }
      pendingMessagesRef.current = lastSentMessagesRef.current;
      startChat();
    }, 600 * readinessAttemptRef.current);

    return () => window.clearTimeout(timeoutId);
  }, [chatId, currentResult, isFailure, runChat, startChat]);

  const handleSend = () => {
    if (!input.trim()) return;
    const userMsg: Message = { role: "user", message: input };
    setHistory((prev) => [...prev, userMsg]);
    setInput("");

    const messages = historyToMessages([...history, userMsg]);
    sendMessages(messages);
  };

  const streamingMessage = useMemo<Message | null>(() => {
    if (currentResult._tag !== "streaming") return null;
    if (currentSegments.length === 0) return null;
    return {
      role: "assistant",
      message: "",
      segments: currentSegments,
    };
  }, [currentResult._tag, currentSegments]);

  const displayHistory = useMemo(() => {
    if (!streamingMessage) return history;
    return [...history, streamingMessage];
  }, [history, streamingMessage]);

  const scrollTrigger = useMemo(
    () => \`\${displayHistory.length}-\${currentSegments.length}\`,
    [displayHistory.length, currentSegments.length],
  );

  const completionSnapshot = useMemo(() => {
    if (currentResult._tag !== "complete") return null;
    if (currentResult.segments.length === 0) return null;
    return {
      segments: currentResult.segments,
      usage: currentResult.usage,
      finishReason: currentResult.finishReason,
    };
  }, [currentResult]);

  useEffect(() => {
    if (!completionSnapshot) return;
    const completionKey = JSON.stringify(completionSnapshot);
    if (lastCompletionKeyRef.current === completionKey) return;
    lastCompletionKeyRef.current = completionKey;
    setHistory((prev) => [
      ...prev,
      {
        role: "assistant",
        message: "",
        segments: completionSnapshot.segments,
        usage: completionSnapshot.usage,
        finishReason: completionSnapshot.finishReason,
      },
    ]);
  }, [completionSnapshot]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollTrigger is stable string
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: isStreaming ? "auto" : "smooth",
    });
  }, [scrollTrigger]);

  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader>
        <CardTitle>Chat (RPC)</CardTitle>
        <div className="flex gap-2 mt-1">
          {chatId && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[0.65rem] text-muted-foreground">
              {chatId}
            </span>
          )}
          {isStarting && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              Starting
            </span>
          )}
          {isStreaming && (
            <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-secondary-foreground">
              Streaming
            </span>
          )}
          {isWaiting && !isStreaming && (
            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
              Loading
            </span>
          )}
          {isFailure && (
            <span className="inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.2em] text-destructive-foreground">
              Error
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 min-h-0 flex flex-col gap-0 p-0">
        <div className="flex-1 min-h-0 overflow-y-auto px-4" ref={scrollContainerRef}>
        <div className="space-y-6 py-6">
          {displayHistory.length === 0 && currentSegments.length === 0 && (
            <div className="flex flex-col items-start gap-2 rounded-none border border-border bg-muted/50 px-4 py-6 text-xs text-muted-foreground">
              <p className="text-[0.65rem] uppercase tracking-[0.28em]">
                Empty channel
              </p>
              <p className="text-xs text-foreground">
                Start with a clear request.
              </p>
            </div>
          )}

          {displayHistory.map((msg, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: stable order in append-only history
              key={i}
              className={cn(
                "flex w-full flex-col gap-2",
                msg.role === "user" ? "items-end mb-8" : "items-start",
              )}
            >
              {msg.role === "user" ? (
                <div className="max-w-[85%] rounded-none border border-primary/40 bg-primary px-4 py-2 text-xs text-primary-foreground shadow-xs whitespace-break-spaces">
                  {msg.message}
                </div>
              ) : (
                <>
                  {msg.segments?.map((segment, segIdx) => (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                      key={segIdx}
                      className="w-full"
                    >
                      {segment._tag === "text" ? (
                        <div className="w-full py-2 text-xs whitespace-pre-wrap">
                          {segment.content}
                        </div>
                      ) : (
                        <div className="rounded-none border border-border bg-muted/50 p-3 text-xs">
                          <span className="font-mono text-muted-foreground">
                            Tool: {segment.tool.name} [{segment.tool.status}]
                          </span>
                          {segment.tool.result && (
                            <pre className="mt-1 text-xs overflow-auto">
                              {segment.tool.result}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {msg.usage && msg.finishReason && (
                    <div className="text-[0.6rem] text-muted-foreground">
                      {msg.usage.totalTokens} tokens | {msg.finishReason}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {currentResult._tag === "streaming" && currentResult.reasoning && (
            <div className="flex w-full flex-col gap-2 items-start">
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Reasoning: {currentResult.reasoning}
              </div>
            </div>
          )}

          {currentResult._tag === "error" && (
            <div className="text-destructive text-xs p-3 border border-destructive/40 bg-destructive/10 rounded-none">
              <p className="font-medium text-foreground">
                {currentResult.error.message}
              </p>
              {currentResult.error.recoverable && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const messages = historyToMessages(history);
                    sendMessages(messages);
                  }}
                >
                  Retry
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex w-full gap-2">
          <Input
            type="text"
            placeholder="Send a message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={isStarting || isWaiting || isStreaming}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStarting || isWaiting || isStreaming}
            >
            Send
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}

const historyToMessages = (messages: Message[]) =>
  messages.map((msg) => {
    if (msg.role === "assistant" && msg.segments) {
      const textContent = msg.segments
        .filter((seg) => seg._tag === "text")
        .map((seg) => seg.content)
        .join("");
      return {
        role: msg.role,
        content: textContent || msg.message,
      };
    }
    return {
      role: msg.role,
      content: msg.message,
    };
  });
`;
