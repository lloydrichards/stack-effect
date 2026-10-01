import { useAtom } from "@effect/atom-react";
import type { ChatId, ChatResponse, MessageSegment } from "@repo/domain/Chat";
import { Cause } from "effect";
import { AsyncResult } from "effect/reactivity";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageContent,
  MessageFooter,
  MessageGroup,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { chatAtom, chatStartAtom } from "@/lib/atoms/chat-atom";

type ChatEntry = {
  id: string;
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

const EMPTY_SEGMENTS: readonly MessageSegment[] = [];

export function ChatBox() {
  const [result, runChat] = useAtom(chatAtom);
  const [startResult, startChat] = useAtom(chatStartAtom);
  const [chatId, setChatId] = useState<ChatId | null>(null);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<ChatEntry[]>([]);
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
  const entryIdRef = useRef(0);
  const nextEntryId = () => {
    entryIdRef.current += 1;
    return `chat-entry-${entryIdRef.current}`;
  };

  const currentResult: ChatResponse = AsyncResult.getOrElse(
    result,
    () => ({ _tag: "initial" }) as const,
  );

  const currentSegments =
    currentResult._tag === "initial" ? EMPTY_SEGMENTS : currentResult.segments;

  const isWaiting = AsyncResult.isWaiting(result);
  const isStarting = AsyncResult.isWaiting(startResult);
  const isFailure = AsyncResult.isFailure(result);
  const isStreaming = currentResult._tag === "streaming";
  const asyncFailureMessage = isFailure ? Cause.pretty(result.cause) : null;

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
    const userMsg: ChatEntry = {
      id: nextEntryId(),
      role: "user",
      message: input,
    };
    setHistory((prev) => [...prev, userMsg]);
    setInput("");

    const messages = historyToMessages([...history, userMsg]);
    sendMessages(messages);
  };

  const displayHistory =
    currentResult._tag === "streaming" && currentResult.segments.length > 0
      ? [
          ...history,
          {
            id: `streaming-${chatId ?? "pending"}`,
            role: "assistant" as const,
            message: "",
            segments: currentResult.segments,
          },
        ]
      : history;

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
        id: nextEntryId(),
        role: "assistant",
        message: "",
        segments: completionSnapshot.segments,
        usage: completionSnapshot.usage,
        finishReason: completionSnapshot.finishReason,
      },
    ]);
  }, [completionSnapshot]);

  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader>
        <CardTitle>Chat (RPC)</CardTitle>
        <div className="mt-1 flex flex-wrap gap-2">
          {chatId && (
            <Marker className="w-fit rounded-none border border-border bg-muted px-2 py-0.5 font-mono text-[0.65rem]">
              <MarkerContent>{chatId}</MarkerContent>
            </Marker>
          )}
          {isStarting && <StatusMarker label="Starting" status="pending" />}
          {isStreaming && <StatusMarker label="Streaming" status="active" />}
          {isWaiting && !isStreaming && (
            <StatusMarker label="Loading" status="pending" />
          )}
          {isFailure && <StatusMarker label="Error" status="error" />}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport className="px-4">
              <MessageScrollerContent className="py-6">
                {displayHistory.length === 0 &&
                  currentSegments.length === 0 && (
                    <Marker variant="border" className="bg-muted/50 px-4 py-6">
                      <MarkerContent className="flex flex-col gap-2">
                        <span className="text-[0.65rem] uppercase tracking-[0.28em]">
                          Empty channel
                        </span>
                        <span className="text-xs text-foreground">
                          Start with a clear request.
                        </span>
                      </MarkerContent>
                    </Marker>
                  )}

                {displayHistory.map((msg, i) => (
                  <MessageScrollerItem
                    key={msg.id}
                    scrollAnchor={i === displayHistory.length - 1}
                  >
                    {msg.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble align="end">
                            <BubbleContent className="whitespace-break-spaces">
                              {msg.message}
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message align="start">
                        <MessageContent>
                          <MessageGroup>
                            {msg.segments?.map((segment, segIdx) => (
                              <AssistantSegment
                                // biome-ignore lint/suspicious/noArrayIndexKey: stable order
                                key={segIdx}
                                segment={segment}
                              />
                            ))}
                          </MessageGroup>
                          {msg.usage && msg.finishReason && (
                            <MessageFooter className="text-[0.6rem]">
                              {msg.usage.totalTokens} tokens |{" "}
                              {msg.finishReason}
                            </MessageFooter>
                          )}
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}

                {currentResult._tag === "streaming" &&
                  currentResult.reasoning && (
                    <Marker>
                      <MarkerContent className="shimmer">
                        Reasoning: {currentResult.reasoning}
                      </MarkerContent>
                    </Marker>
                  )}

                {currentResult._tag === "error" && (
                  <Bubble variant="destructive" className="max-w-full">
                    <BubbleContent className="flex flex-col gap-2">
                      <p className="font-medium">
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
                    </BubbleContent>
                  </Bubble>
                )}

                {asyncFailureMessage && currentResult._tag !== "error" && (
                  <Bubble variant="destructive" className="max-w-full">
                    <BubbleContent>
                      <pre className="whitespace-pre-wrap text-xs">
                        {asyncFailureMessage}
                      </pre>
                    </BubbleContent>
                  </Bubble>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

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

function StatusMarker({
  label,
  status,
}: {
  label: string;
  status: "active" | "error" | "pending";
}) {
  const Icon =
    status === "error"
      ? CircleAlertIcon
      : status === "active"
        ? CircleCheckIcon
        : LoaderCircleIcon;

  return (
    <Marker variant={status === "active" ? "border" : "default"}>
      <MarkerIcon
        className={
          status === "error"
            ? "text-destructive"
            : status === "pending"
              ? "animate-spin"
              : undefined
        }
      >
        <Icon />
      </MarkerIcon>
      <MarkerContent>{label}</MarkerContent>
    </Marker>
  );
}

function AssistantSegment({ segment }: { segment: MessageSegment }) {
  return segment._tag === "text" ? (
    <Bubble variant="ghost" className="max-w-full">
      <BubbleContent className="whitespace-pre-wrap">
        {segment.content}
      </BubbleContent>
    </Bubble>
  ) : (
    <Bubble variant="muted" className="max-w-full">
      <BubbleContent>
        <Marker>
          <MarkerContent className="font-mono">
            Tool: {segment.tool.name} [{segment.tool.status}]
          </MarkerContent>
        </Marker>
        {segment.tool.result && (
          <pre className="mt-2 overflow-auto text-xs">
            {segment.tool.result}
          </pre>
        )}
      </BubbleContent>
    </Bubble>
  );
}

const historyToMessages = (messages: ChatEntry[]) =>
  messages.map((msg) => {
    if (msg.role === "assistant" && msg.segments) {
      const textContent = msg.segments.reduce(
        (content, seg) =>
          seg._tag === "text" ? content + seg.content : content,
        "",
      );
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
