import { CounterState } from "@repo/domain/Counter";
import { Effect, Match, Schema } from "effect";
import { Command } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { taggedStruct as message } from "foldkit/schema";
import { counterError, incrementCounter } from "../lib/counter-client";

export const Model = Schema.Struct({
  id: Schema.String,
  pending: Schema.Boolean,
  status: Schema.String,
});
type Model = typeof Model.Type;

const InputChanged = message("InputChanged", { id: Schema.String });
const Submitted = message("Submitted");
const Incremented = message("Incremented", { result: CounterState });
const Failed = message("Failed", { error: Schema.String });
const Message = Schema.Union([InputChanged, Submitted, Incremented, Failed]);
type Message = typeof Message.Type;

export const GotMessage = message("GotCounterMessage", { message: Message });

const Increment = Command.define("IncrementCounter", {
  args: { id: Schema.String },
  messages: [Incremented, Failed],
  execute: ({ id }) =>
    incrementCounter(id).pipe(
      Effect.match({
        onSuccess: (result) => Incremented({ result }),
        onFailure: (failure) => Failed({ error: counterError(failure) }),
      }),
    ),
});

type Update = readonly [Model, ReadonlyArray<Command.Command<Message>>];

export const init = (): Update => [{ id: "", pending: false, status: "" }, []];

export const update = (model: Model, event: Message): Update =>
  Match.value(event).pipe(
    Match.withReturnType<Update>(),
    Match.tagsExhaustive({
      InputChanged: ({ id }) => [{ ...model, id }, []],
      Submitted: () =>
        model.pending || model.id === ""
          ? [model, []]
          : [
              { ...model, pending: true, status: "Incrementing…" },
              [Increment({ id: model.id })],
            ],
      Incremented: ({ result }) => [
        { ...model, pending: false, status: `${result.id}: ${result.count}` },
        [],
      ],
      Failed: ({ error }) => [{ ...model, pending: false, status: error }, []],
    }),
  );

export const view = <ParentMessage>(
  model: Model,
  toParent: (event: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.section(
    [h.Class("rounded-lg border bg-card p-6 text-card-foreground")],
    [
      h.h2([h.Class("mb-4 font-semibold")], ["Cluster counter"]),
      h.form(
        [h.Class("flex flex-col gap-3"), h.OnSubmit(toParent(Submitted()))],
        [
          h.label([h.For("counter-id")], ["Counter ID"]),
          h.input([
            h.Id("counter-id"),
            h.Class("rounded-md border bg-background p-2"),
            h.Value(model.id),
            h.Required(true),
            h.OnInput((id) => toParent(InputChanged({ id }))),
          ]),
          h.button(
            [
              h.Type("submit"),
              h.Class(
                "rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50",
              ),
              h.Disabled(model.pending || model.id === ""),
            ],
            ["Increment counter"],
          ),
        ],
      ),
      h.p([h.Class("mt-4 break-all"), h.Role("status")], [model.status]),
    ],
  );
