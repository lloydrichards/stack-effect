import { ChatPreparationError } from "@repo/domain/Chat";
import { Effect } from "effect";
import type { Prompt, Tool, Toolkit } from "effect/ai";

export interface ChatTurnExtension<
  Tools extends Record<string, Tool.Any> = {},
> {
  readonly messages?: ReadonlyArray<Prompt.Message>;
  readonly inputMessages?: ReadonlyArray<Prompt.Message>;
  readonly toolkit?: Toolkit.WithHandler<Tools>;
}

function extendReadyToolkit<
  Local extends Record<string, Tool.Any>,
  Extra extends Record<string, Tool.Any>,
>(
  local: Toolkit.WithHandler<Local>,
  extras: ReadonlyArray<Toolkit.WithHandler<Extra>>,
): Toolkit.WithHandler<Toolkit.MergeRecords<Local | Extra>>;
function extendReadyToolkit<Tools extends Record<string, Tool.Any>>(
  local: Toolkit.WithHandler<Tools>,
  extras: ReadonlyArray<Toolkit.WithHandler<Tools>>,
): Toolkit.WithHandler<Tools> {
  return {
    tools: extras.reduce<Tools>(
      (tools, extra) => ({ ...tools, ...extra.tools }),
      local.tools,
    ),
    handle(name, params, id, options) {
      const owner = extras.find((extra) => Object.hasOwn(extra.tools, name));
      return (owner ?? local).handle(name, params, id, options);
    },
  };
}

export const prepareChatTurn = <
  Local extends Record<string, Tool.Any>,
  Extra extends Record<string, Tool.Any>,
  E,
>(
  history: ReadonlyArray<Prompt.Message>,
  local: Toolkit.WithHandler<Local>,
  preparations: ReadonlyArray<() => Effect.Effect<ChatTurnExtension<Extra>, E>>,
) =>
  Effect.gen(function* () {
    const prepared = yield* Effect.all(
      preparations.map((prepare) => prepare()),
    );
    const extras = prepared.flatMap((extension) =>
      extension.toolkit === undefined ? [] : [extension.toolkit],
    );
    const names = [
      ...Object.keys(local.tools),
      ...extras.flatMap((extra) => Object.keys(extra.tools)),
    ];
    const duplicate =
      names.length === new Set(names).size
        ? undefined
        : names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate !== undefined) {
      return yield* new ChatPreparationError({
        reason: {
          code: "tool-conflict",
          message: `Duplicate chat tool name: ${duplicate}`,
          source: duplicate,
        },
      });
    }
    const context = prepared.flatMap((extension) => extension.messages ?? []);
    const input = prepared.flatMap((extension) => extension.inputMessages ?? []);
    const contextIndex =
      history.at(-1)?.role === "user" ? history.length - 1 : history.length;
    return {
      messages: [
        ...history.slice(0, contextIndex),
        ...context,
        ...input,
        ...history.slice(contextIndex),
      ],
      toolkit: extendReadyToolkit(local, extras),
    };
  });
