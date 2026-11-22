import {
  ReceiptExecutionId,
  ReceiptId,
  ReceiptStatus,
} from "@repo/domain/Receipt";
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

const Submission = Schema.TaggedUnion({
  Idle: {},
  Starting: {},
  Failed: { message: Schema.NonEmptyString },
});

export const Model = Schema.Struct({
  receiptId: Schema.String,
  rows: Schema.Array(ReceiptRow),
  unavailable: Schema.Array(ReceiptExecutionId),
  submission: Submission,
});
type Model = typeof Model.Type;

const InputChanged = message("InputChanged", { value: Schema.String });
const Submitted = message("Submitted");
const Started = message("Started", { submittedId: ReceiptId, row: ReceiptRow });
const StartFailed = message("StartFailed");
const Finished = message("Finished", {
  executionId: ReceiptExecutionId,
  status: ReceiptStatus,
});
const PollFailed = message("PollFailed", { executionId: ReceiptExecutionId });
const HistorySaved = message("HistorySaved");
const HistoryChanged = message("HistoryChanged", {
  rows: Schema.Array(ReceiptRow),
});
const Retry = message("Retry", { executionId: ReceiptExecutionId });
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
  args: { receiptId: ReceiptId },
  messages: [Started, StartFailed],
  execute: ({ receiptId }) =>
    startReceipt(receiptId).pipe(
      Effect.map((executionId) =>
        Started({
          submittedId: receiptId,
          row: saveReceipt({ receiptId, executionId, status: "Pending" }),
        }),
      ),
      Effect.orElseSucceed(() => StartFailed()),
    ),
});

const Wait = Command.define("AwaitReceipt", {
  args: { executionId: ReceiptExecutionId },
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
    { receiptId: "", rows, unavailable: [], submission: { _tag: "Idle" } },
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
  if (existing.status !== "Pending") return [model, []];

  const row = change(existing);
  return [
    {
      ...model,
      rows: upsertReceipt(model.rows, row),
      unavailable: model.unavailable.filter((id) => id !== executionId),
    },
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
        { ...model, rows: rows.reduce(upsertReceipt, model.rows) },
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
        return model.submission._tag === "Starting" ||
          !Schema.is(ReceiptId)(receiptId)
          ? [model, []]
          : [
              { ...model, submission: { _tag: "Starting" } },
              [Start({ receiptId })],
            ];
      },
      Started: ({ submittedId, row }) => {
        const next = {
          ...model,
          rows: upsertReceipt(model.rows, row),
          submission: { _tag: "Idle" } as const,
          receiptId:
            model.receiptId.trim() === submittedId ? "" : model.receiptId,
        };
        const commands =
          row.status === "Pending" &&
          !model.rows.some((item) => item.executionId === row.executionId)
            ? [Wait({ executionId: row.executionId })]
            : [];

        return [next, commands];
      },
      StartFailed: () => [
        {
          ...model,
          submission: {
            _tag: "Failed",
            message: "Could not start the receipt. Try again.",
          },
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
        model.unavailable.includes(executionId) ||
        !model.rows.some(
          (row) => row.executionId === executionId && row.status === "Pending",
        )
          ? [model, []]
          : [
              { ...model, unavailable: [...model.unavailable, executionId] },
              [],
            ],
      Retry: ({ executionId }) =>
        model.unavailable.includes(executionId) &&
        model.rows.some(
          (row) => row.executionId === executionId && row.status === "Pending",
        )
          ? [
              {
                ...model,
                unavailable: model.unavailable.filter(
                  (id) => id !== executionId,
                ),
              },
              [Wait({ executionId })],
            ]
          : [model, []],
    }),
  );

const receiptForm = <ParentMessage>(
  model: Model,
  toParent: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.div(
    [h.Class("space-y-3")],
    [
      h.form(
        [h.Class("flex flex-col gap-3"), h.OnSubmit(toParent(Submitted()))],
        [
          h.label([h.For("receipt-id")], ["Receipt ID"]),
          h.input([
            h.Id("receipt-id"),
            h.Class(
              "rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            ),
            h.Value(model.receiptId),
            h.Required(true),
            h.OnInput((value) => toParent(InputChanged({ value }))),
          ]),
          h.button(
            [
              h.Type("submit"),
              h.Class(
                "inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
              ),
              h.Disabled(
                model.submission._tag === "Starting" || !model.receiptId.trim(),
              ),
            ],
            [
              model.submission._tag === "Starting"
                ? "Starting…"
                : "Start receipt",
            ],
          ),
        ],
      ),
      ...Match.value(model.submission).pipe(
        Match.tagsExhaustive({
          Idle: () => [],
          Starting: () => [],
          Failed: ({ message }) => [
            h.p([h.Role("alert"), h.Class("mt-3")], [message]),
          ],
        }),
      ),
    ],
  );

const receiptRow = <ParentMessage>(
  row: ReceiptRow,
  unavailable: boolean,
  toParent: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.tr(
    [h.Class("border-t align-top")],
    [
      h.th(
        [h.Class("break-all py-2 pr-4 text-left font-medium")],
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
          unavailable ? "Status unavailable" : row.status,
          ...(unavailable
            ? [
                h.button(
                  [
                    h.Type("button"),
                    h.Class(
                      "ml-2 rounded-sm underline focus-visible:ring-2 focus-visible:ring-ring",
                    ),
                    h.OnClick(
                      toParent(Retry({ executionId: row.executionId })),
                    ),
                  ],
                  ["Retry"],
                ),
              ]
            : []),
        ],
      ),
    ],
  );

const receiptHistory = <ParentMessage>(
  model: Model,
  toParent: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.div(
    [],
    [
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
                      receiptRow(
                        row,
                        row.status === "Pending" &&
                          model.unavailable.includes(row.executionId),
                        toParent,
                        h,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
    ],
  );

export const view = <ParentMessage>(
  model: Model,
  toParent: (message: Message) => ParentMessage,
  h: HtmlBuilder<ParentMessage>,
): Html =>
  h.section(
    [
      h.Class(
        "rounded-lg border border-border bg-card text-card-foreground shadow-sm",
      ),
    ],
    [
      h.h2(
        [
          h.Class(
            "border-b border-border p-6 font-semibold leading-none tracking-tight",
          ),
        ],
        ["Receipt workflow"],
      ),
      h.div(
        [h.Class("p-6 pt-4")],
        [receiptForm(model, toParent, h), receiptHistory(model, toParent, h)],
      ),
    ],
  );
