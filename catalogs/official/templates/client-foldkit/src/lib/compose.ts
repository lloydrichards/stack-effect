import { Array as Arr, Effect, Record } from "effect";
import type { Html } from "foldkit/html";

/**
 * Composition helpers for foldkit TEA architecture.
 * Used by the scaffold to compose child features into the root main.ts.
 */

/** Structural shape of a Command without the conditional type indirection. */
type AnyCommand<T> = Readonly<{
  name: string;
  args?: Record<string, unknown>;
  effect: Effect.Effect<T>;
}>;

export const Init = {
  child: <Model, Message, ParentMessage>(
    mod: {
      readonly init: () => readonly [Model, ReadonlyArray<AnyCommand<Message>>];
    },
    key: string,
    toParentMessage: (input: { message: Message }) => ParentMessage,
  ) => {
    const [model, cmds] = mod.init();
    const commands: ReadonlyArray<AnyCommand<ParentMessage>> = Arr.map(
      cmds,
      (cmd): AnyCommand<ParentMessage> => ({
        name: cmd.name,
        ...(cmd.args !== undefined ? { args: cmd.args } : {}),
        effect: Effect.map(cmd.effect, (message) =>
          toParentMessage({ message }),
        ),
      }),
    );
    return { key, model, commands };
  },

  compose: <
    ParentModel extends Record<string, unknown>,
    ParentMessage,
    Children extends ReadonlyArray<{
      readonly key: string;
      readonly model: unknown;
      readonly commands: ReadonlyArray<AnyCommand<ParentMessage>>;
    }>,
  >(
    ...children: Children
  ) => {
    const model = Record.fromIterableWith(children, (child) => [
      child.key,
      child.model,
    ]) as ParentModel;
    const commands = Arr.flatMap(children, (child) => child.commands);
    return [model, commands] as const;
  },
};

export const Views = {
  compose: (...children: ReadonlyArray<Html>): ReadonlyArray<Html> => children,
};
