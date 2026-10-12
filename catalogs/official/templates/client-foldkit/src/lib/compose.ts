import { Array as Arr, Record } from "effect";
import { Command } from "foldkit";
import type { Html } from "foldkit/html";

/**
 * Composition helpers for foldkit TEA architecture.
 * Used by the scaffold to compose child features into the root main.ts.
 */

export const Init = {
  child: <Model, Message, ParentMessage>(
    mod: {
      readonly init: () => readonly [
        Model,
        ReadonlyArray<Command.Command<Message>>,
      ];
    },
    key: string,
    toParentMessage: (input: { message: Message }) => ParentMessage,
  ) => {
    const [model, cmds] = mod.init();
    const commands = Command.mapMessages(cmds, (message) =>
      toParentMessage({ message }),
    );
    return { key, model, commands };
  },

  compose: <
    ParentModel extends Record<string, unknown>,
    ParentMessage,
    Children extends ReadonlyArray<{
      readonly key: string;
      readonly model: unknown;
      readonly commands: ReadonlyArray<Command.Command<ParentMessage>>;
    }>,
  >(
    ...children: Children
  ) => {
    const model = Record.fromIterableWith(children, (child) => [
      child.key,
      child.model,
    ]) as ParentModel;
    const commands = Arr.flatMap(children, (child) => child.commands);
    return { model, commands };
  },
};

export const Views = {
  compose: (...children: ReadonlyArray<Html>): ReadonlyArray<Html> => children,
};
