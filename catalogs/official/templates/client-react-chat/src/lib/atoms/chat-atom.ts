import {
  type ChatId,
  type ChatMessage,
  type ChatResponse,
  ChatStreamPart,
  type ToolCall,
} from "@repo/domain/Chat";
import { Effect, Stream } from "effect";
import type { Atom as AtomType } from "effect/reactivity";
import { runtime } from "../atom";
import { ChatRpcClient } from "../chat-rpc-client";

export const chatStartAtom: AtomType.AtomResultFn<
  void,
  { readonly chatId: ChatId },
  unknown
> = runtime.fn(() =>
  Effect.gen(function* () {
    const rpc = yield* ChatRpcClient;
    return yield* rpc.client.chat_start();
  }).pipe(Effect.provide(ChatRpcClient.layer)),
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
          (state._tag === "streaming" ? (state.reasoning ?? "") : "") +
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

    "tool-success": (part) =>
      updateToolResult(state, {
        id: part.id,
        status: "complete",
        result: part.output,
      }),

    "tool-failure": (part) =>
      updateToolResult(state, {
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
> = runtime.fn(({ chatId, messages }) => {
  return Stream.unwrap(
    Effect.gen(function* () {
      const rpc = yield* ChatRpcClient;
      return rpc.client.chat_ask({ chatId, messages });
    }),
  ).pipe(
    Stream.provide(ChatRpcClient.layer),
    Stream.tapError((error: unknown) =>
      Effect.logError("[chatAtom] Stream error occurred:", error),
    ),
    Stream.scan(
      () => ({ _tag: "initial" as const }),
      accumulateChatResponse,
    ),
    Stream.drop(1),
    Stream.catch((error: unknown) => {
      const errorMessage =
        error instanceof Error
          ? `Stream failed: ${error.message}`
          : `Stream failed: ${String(error)}`;
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
