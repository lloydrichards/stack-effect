import { ReceiptStatus } from "@repo/domain/ReceiptApi";
import { Effect, Match, Schema, Stream } from "effect";
import { Command, Subscription } from "foldkit";
import type { Html, HtmlBuilder } from "foldkit/html";
import { taggedStruct as message } from "foldkit/schema";
import { awaitReceipt, startReceipt } from "../lib/receipt-client";
import {
  loadReceipts,
  receiptHistoryKey,
  ReceiptRow,
  saveReceipt,
  upsertReceipt,
} from "../lib/receipt-history";

export const Model = Schema.Struct({
  receiptId: Schema.String,
  rows: Schema.Array(ReceiptRow),
  starting: Schema.Boolean,
  error: Schema.String,
});
type Model = typeof Model.Type;

const InputChanged = message("InputChanged", { value: Schema.String });
const Submitted = message("Submitted");
const Started = message("Started", {
  receiptId: Schema.String,
  executionId: Schema.String,
});
const StartFailed = message("StartFailed");
const Finished = message("Finished", {
  executionId: Schema.String,
  status: ReceiptStatus,
});
const PollFailed = message("PollFailed", { executionId: Schema.String });
const HistorySaved = message("HistorySaved");
const HistoryChanged = message("HistoryChanged", {
  rows: Schema.Array(ReceiptRow),
});
const Retry = message("Retry", { executionId: Schema.String });
const Message = Schema.Union([
  InputChanged,
  Submitted,
  Started,
  StartFailed,
  Finished,
  PollFailed,
  Retry,
  HistorySaved,
  HistoryChanged,
]);
type Message = typeof Message.Type;
export const GotMessage = message("GotReceiptMessage", { message: Message });

const Start = Command.define("StartReceipt", {
  args: { receiptId: Schema.String },
  messages: [Started, StartFailed],
  execute: ({ receiptId }) =>
    startReceipt(receiptId).pipe(
      Effect.map((executionId) => Started({ receiptId, executionId })),
      Effect.orElseSucceed(() => StartFailed()),
    ),
});

const Wait = Command.define("AwaitReceipt", {
  args: { executionId: Schema.String },
  messages: [Finished, PollFailed],
  execute: ({ executionId }) =>
    awaitReceipt(executionId).pipe(
      Effect.map((status) => Finished({ executionId, status })),
      Effect.orElseSucceed(() => PollFailed({ executionId })),
    ),
});

const Remember = Command.define("SaveReceiptHistory", {
  args: { row: ReceiptRow },
  messages: [HistorySaved],
  execute: ({ row }) =>
    Effect.sync(() => {
      saveReceipt(row);
      return HistorySaved();
    }),
});

type Update = readonly [Model, ReadonlyArray<Command.Command<Message>>];

export const init = (): Update => {
  const rows = loadReceipts();
  return [
    { receiptId: "", rows, starting: false, error: "" },
    rows
      .filter((row) => row.status === "Pending")
      .map(({ executionId }) => Wait({ executionId })),
  ];
};

function updateRow(
  model: Model,
  executionId: string,
  change: (row: ReceiptRow) => ReceiptRow,
): Update {
  const existing = model.rows.find((row) => row.executionId === executionId);
  if (!existing) return [model, []];
  const row = change(existing);
  return [
    { ...model, rows: upsertReceipt(model.rows, row) },
    [Remember({ row })],
  ];
}

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  receiptHistory: Subscription.persistentEntry(
    Stream.fromEventListener<StorageEvent>(window, "storage").pipe(
      Stream.filter((event) => event.key === receiptHistoryKey),
      Stream.map(() => HistoryChanged({ rows: loadReceipts() })),
    ),
  ),
}));

export const update = (model: Model, event: Message): Update =>
  Match.value(event).pipe(
    Match.withReturnType<Update>(),
    Match.tagsExhaustive({
      HistorySaved: () => [model, []],
      HistoryChanged: ({ rows }) => [
        { ...model, rows },
        rows
          .filter(
            (row) =>
              row.status === "Pending" &&
              !model.rows.some(
                (previous) =>
                  previous.executionId === row.executionId &&
                  previous.status === "Pending",
              ),
          )
          .map(({ executionId }) => Wait({ executionId })),
      ],
      InputChanged: ({ value }) => [{ ...model, receiptId: value }, []],
      Submitted: () => {
        const receiptId = model.receiptId.trim();
        return model.starting || !receiptId
          ? [model, []]
          : [{ ...model, starting: true, error: "" }, [Start({ receiptId })]];
      },
      Started: ({ receiptId, executionId }) => {
        const next = {
          ...model,
          starting: false,
          receiptId:
            model.receiptId.trim() === receiptId ? "" : model.receiptId,
        };
        if (model.rows.some((row) => row.executionId === executionId))
          return [next, []];
        const row = ReceiptRow.make({
          receiptId,
          executionId,
          status: "Pending",
        });
        return [
          { ...next, rows: upsertReceipt(model.rows, row) },
          [Remember({ row }), Wait({ executionId })],
        ];
      },
      StartFailed: () => [
        {
          ...model,
          starting: false,
          error: "Could not start the receipt. Try again.",
        },
        [],
      ],
      Finished: ({ executionId, status }) =>
        updateRow(model, executionId, (row) =>
          status._tag === "Confirmed"
            ? { ...row, receiptId: status.receiptId, status: "Confirmed" }
            : { ...row, status: "Failed" },
        ),
      PollFailed: ({ executionId }) =>
        updateRow(model, executionId, (row) => ({
          ...row,
          status: "Status unavailable",
        })),
      Retry: ({ executionId }) => {
        const [next, commands] = updateRow(model, executionId, (row) => ({
          ...row,
          status: "Pending",
        }));
        return [next, [...commands, Wait({ executionId })]];
      },
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
            h.Required(true),
            h.OnInput((value) => toParent(InputChanged({ value }))),
          ]),
          h.button(
            [
              h.Type("submit"),
              h.Class(
                "rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50",
              ),
              h.Disabled(model.starting || !model.receiptId.trim()),
            ],
            [model.starting ? "Starting…" : "Start receipt"],
          ),
        ],
      ),
      ...(model.error
        ? [h.p([h.Role("alert"), h.Class("mt-3")], [model.error])]
        : []),
      h.h3([h.Class("mt-6 font-medium")], ["Receipt history"]),
      h.p(
        [h.Class("mb-2 text-sm text-muted-foreground")],
        ["Submissions from this browser."],
      ),
      model.rows.length === 0
        ? h.p([h.Class("text-sm")], ["No receipts yet."])
        : h.div(
            [
              h.Class("max-h-72 overflow-auto"),
              h.Tabindex(0),
              h.AriaLabel("Scrollable receipt history"),
            ],
            [
              h.table(
                [
                  h.AriaLabel("Receipt history"),
                  h.Class("w-full table-fixed text-sm"),
                ],
                [
                  h.thead(
                    [],
                    [
                      h.tr(
                        [],
                        [
                          h.th([h.Class("w-2/3 text-left")], ["Receipt"]),
                          h.th([h.Class("text-left")], ["Status"]),
                        ],
                      ),
                    ],
                  ),
                  h.tbody(
                    [],
                    model.rows.map((row) =>
                      h.tr(
                        [h.Class("border-t align-top")],
                        [
                          h.th(
                            [
                              h.Class(
                                "break-all py-2 pr-4 text-left font-medium",
                              ),
                            ],
                            [
                              row.receiptId,
                              h.code(
                                [
                                  h.Class(
                                    "block break-all text-xs font-normal text-muted-foreground",
                                  ),
                                ],
                                [row.executionId],
                              ),
                            ],
                          ),
                          h.td(
                            [h.Class("py-2"), h.Role("status")],
                            [
                              row.status,
                              ...(row.status === "Status unavailable"
                                ? [
                                    h.button(
                                      [
                                        h.Type("button"),
                                        h.Class("ml-2 underline"),
                                        h.OnClick(
                                          toParent(
                                            Retry({
                                              executionId: row.executionId,
                                            }),
                                          ),
                                        ),
                                      ],
                                      ["Retry"],
                                    ),
                                  ]
                                : []),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
    ],
  );
