import { ChatStreamPart } from "@repo/domain/Chat";
import { type Cause, Queue } from "effect";

/**
 * MailboxEvents - Typed event emitter for ChatStreamPart
 * Provides high-level methods for common event patterns to eliminate boilerplate
 */
export const createMailboxEvents = (
  queue: Queue.Queue<typeof ChatStreamPart.Type, Cause.Done>,
) =>
  ({
    text: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.text.make({ delta })),
    reasoning: (delta: string) =>
      Queue.offer(queue, ChatStreamPart.cases.reasoning.make({ delta })),
    toolStart: (
      id: string,
      params: {
        name: string;
        input?: string;
      },
    ) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-start"].make({
          id,
          name: params.name,
          ...(params.input === undefined ? {} : { input: params.input }),
        }),
      ),
    toolSuccess: (id: string, params: { name: string; output: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-success"].make({
          id,
          name: params.name,
          output: params.output,
        }),
      ),
    toolFailure: (id: string, params: { name: string; error: string }) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases["tool-failure"].make({
          id,
          name: params.name,
          error: params.error,
        }),
      ),
    finish: (
      reason: string,
      usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
      },
    ) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.finish.make({
          reason,
          ...(usage === undefined ? {} : { usage }),
        }),
      ),
    error: (message: string, recoverable = false) =>
      Queue.offer(
        queue,
        ChatStreamPart.cases.error.make({ message, recoverable }),
      ),
    end: Queue.end(queue),
  }) as const;
