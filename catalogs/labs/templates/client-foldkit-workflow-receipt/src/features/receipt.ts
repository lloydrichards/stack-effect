import { ReceiptStatus } from "@repo/domain/ReceiptApi";
import { Effect, Match, Schema } from "effect";
import { Command } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { taggedStruct as message } from "foldkit/schema";
import {
  awaitReceipt,
  savedExecutionId,
  saveExecutionId,
  startReceipt,
} from "../lib/receipt-client";

export const Model = Schema.Struct({
  receiptId: Schema.String,
  executionId: Schema.NullOr(Schema.String),
  status: Schema.String,
  busy: Schema.Boolean,
});
type Model = typeof Model.Type;

const InputChanged = message("InputChanged", { value: Schema.String });
const Submitted = message("Submitted");
const Started = message("Started", { executionId: Schema.String });
const Finished = message("Finished", { status: ReceiptStatus });
const Failed = message("Failed", { error: Schema.String });

const Message = Schema.Union([
  InputChanged,
  Submitted,
  Started,
  Finished,
  Failed,
]);
type Message = typeof Message.Type;

export const GotMessage = message("GotReceiptMessage", { message: Message });

const Start = Command.define("StartReceipt", {
  args: { receiptId: Schema.String },
  messages: [Started, Failed],
  execute: ({ receiptId }) =>
    startReceipt(receiptId).pipe(
      Effect.tap((id) => Effect.sync(() => saveExecutionId(id))),
      Effect.map((executionId) => Started({ executionId })),
      Effect.orElseSucceed(() =>
        Failed({ error: "Could not start the receipt. Try again." }),
      ),
    ),
});

const Wait = Command.define("AwaitReceipt", {
  args: { executionId: Schema.String },
  messages: [Finished, Failed],
  execute: ({ executionId }) =>
    awaitReceipt(executionId).pipe(
      Effect.map((status) => Finished({ status })),
      Effect.orElseSucceed(() =>
        Failed({ error: "Could not check status. Refresh to try again." }),
      ),
    ),
});

type Update = readonly [Model, ReadonlyArray<Command.Command<Message>>];

export const init = (): Update => {
  const executionId = savedExecutionId();
  return [
    {
      receiptId: "",
      executionId,
      status: executionId ? "Pending" : "",
      busy: executionId !== null,
    },
    executionId ? [Wait({ executionId })] : [],
  ];
};

export const update = (model: Model, event: Message): Update =>
  Match.value(event).pipe(
    Match.withReturnType<Update>(),
    Match.tagsExhaustive({
      InputChanged: ({ value }) => [{ ...model, receiptId: value }, []],
      Submitted: () => {
        const receiptId = model.receiptId.trim();
        return model.busy || receiptId === ""
          ? [model, []]
          : [
              {
                ...model,
                status: "Starting receipt…",
                executionId: null,
                busy: true,
              },
              [Start({ receiptId })],
            ];
      },
      Started: ({ executionId }) => [
        { ...model, executionId, status: "Pending" },
        [Wait({ executionId })],
      ],
      Finished: ({ status }) => [
        {
          ...model,
          busy: false,
          status:
            status._tag === "Confirmed"
              ? `Confirmed ${status.receiptId}`
              : "Receipt failed.",
        },
        [],
      ],
      Failed: ({ error }) => [{ ...model, busy: false, status: error }, []],
    }),
  );

export const view = <ParentMessage>(
  model: Model,
  toParent: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.section(
    [h.Class("rounded-lg border bg-card p-6 text-card-foreground")],
    [
      h.h2([h.Class("mb-4 font-semibold")], ["Receipt workflow"]),
      h.form(
        [h.Class("flex flex-col gap-3"), h.OnSubmit(toParent(Submitted()))],
        [
          h.label([h.For("receipt-id")], ["Receipt ID"]),
          h.input([
            h.Id("receipt-id"),
            h.Class("rounded-md border bg-background p-2"),
            h.Value(model.receiptId),
            h.OnInput((value) => toParent(InputChanged({ value }))),
          ]),
          h.button(
            [
              h.Type("submit"),
              h.Class(
                "rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50",
              ),
              h.Disabled(model.busy || model.receiptId.trim() === ""),
            ],
            ["Start receipt"],
          ),
        ],
      ),
      h.p([h.Class("mt-4"), h.Role("status")], [model.status]),
      h.code([h.Class("block break-all text-xs")], [model.executionId ?? ""]),
    ],
  );
