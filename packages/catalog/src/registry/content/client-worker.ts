export const clientImportValidationDomainContents = `import { Effect, Option, Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export const ImportRecord = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/),
  ),
  name: Schema.String.check(Schema.isMinLength(1)),
});

export const ImportIssue = Schema.Struct({
  line: Schema.Number,
  message: Schema.String,
});

export const ImportValidationEvent = Schema.TaggedUnion({
  started: { total: Schema.Number },
  row: {
    accepted: Schema.Boolean,
    line: Schema.Number,
    issue: Schema.optional(ImportIssue),
  },
  completed: {
    total: Schema.Number,
  },
});

export class ImportValidationFailure extends Schema.TaggedError<ImportValidationFailure>()(
  "ImportValidationFailure",
  { message: Schema.String },
) {}

export class ImportValidationRpc extends RpcGroup.make(
  Rpc.make("validate", {
    payload: { content: Schema.String },
    success: ImportValidationEvent,
    error: ImportValidationFailure,
    stream: true,
  }),
) {}

export const parseImportRecord = (line: string, lineNumber: number) =>
  Effect.gen(function* () {
    const parsed = yield* Effect.try({
      try: () => JSON.parse(line),
      catch: () => undefined,
    }).pipe(Effect.option);
    return Option.match(parsed, {
      onNone: () => ({
        accepted: false,
        line: lineNumber,
        issue: {
          line: lineNumber,
          message: "Expected a JSON object with a name and email address.",
        },
      }),
      onSome: (value) =>
        Schema.decodeUnknownOption(ImportRecord)(value).pipe(
          Option.match({
            onNone: () => ({
              accepted: false,
              line: lineNumber,
              issue: {
                line: lineNumber,
                message:
                  "Expected a JSON object with a name and email address.",
              },
            }),
            onSome: () => ({ accepted: true, line: lineNumber }),
          }),
        ),
    });
  });
`;

export const clientImportValidationWorkerContents = `/// <reference lib="webworker" />

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { Effect, Layer, Schedule, Stream } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import { ImportValidationRpc, parseImportRecord } from "./domain";

const ImportValidationHandlersLive = ImportValidationRpc.toLayer(
  Effect.gen(function* () {
    return ImportValidationRpc.of({
      validate: ({ content }) => {
        const records = content
          .split("\\n")
          .map((line, index) => ({ line, lineNumber: index + 1 }))
          .filter(({ line }) => line.trim() !== "");
        const rows = Stream.fromIterable(records).pipe(
          Stream.mapEffect(({ line, lineNumber }) =>
            parseImportRecord(line, lineNumber),
          ),
          Stream.map((row) => ({ _tag: "row" as const, ...row })),
          // The demo intentionally paces rows so the Worker/RPC stream is visible.
          // Production code can tune or remove this schedule for its workload.
          Stream.schedule(Schedule.spaced("250 millis")),
        );

        // Seam: this Stream is the capability boundary. The UI only receives
        // serializable events, while validation work and pacing stay in the worker.
        return Stream.concat(
          Stream.succeed({ _tag: "started" as const, total: records.length }),
          Stream.concat(
            rows,
            Stream.succeed({ _tag: "completed" as const, total: records.length }),
          ),
        );
      },
    });
  }),
);

const WorkerLive = RpcServer.layer(ImportValidationRpc).pipe(
  Layer.provide(ImportValidationHandlersLive),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);

Effect.runFork(Layer.launch(WorkerLive));
`;

export const clientImportValidationAtomContents = `import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import { Effect, Layer, Stream } from "effect";
import { type Atom, AtomRpc } from "effect/unstable/reactivity";
import { RpcClient } from "effect/unstable/rpc";
import {
  ImportValidationRpc,
  type ImportValidationEvent,
} from "../workers/import-validation/domain";

class ImportValidationClient extends AtomRpc.Service<ImportValidationClient>()(
  "ImportValidationClient",
  {
    group: ImportValidationRpc,
    protocol: RpcClient.layerProtocolWorker({ size: 1, concurrency: 1 }).pipe(
      Layer.provide(
        BrowserWorker.layer(
          () =>
            new Worker(
              new URL(
                "../workers/import-validation/import-validation.worker.ts",
                import.meta.url,
              ),
              { type: "module" },
            ),
        ),
      ),
    ),
  },
) {}

// Seam: the React app asks for a stream through an Atom. It never owns the
// Worker, protocol, validation loop, or scheduled batch cadence directly.
export const importValidationAtom: Atom.AtomResultFn<
  string,
  typeof ImportValidationEvent.Type,
  unknown
> = ImportValidationClient.runtime.fn((content: string) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* ImportValidationClient;
      return client("validate", { content });
    }),
  ),
);
`;

export const clientImportValidationCardContents = `import { useAtom } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useEffect, useMemo, useState } from "react";
import { importValidationAtom } from "@/lib/import-validation-worker";
import type { ImportValidationEvent } from "@/workers/import-validation/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sample = \`{"name":"Ada Lovelace","email":"ada@example.com"}
{"name":"Grace Hopper","email":"grace@example.com"}
{"name":"Edsger Dijkstra","email":"edsger@example.com"}
{"name":"Missing email"}
{"name":"Barbara Liskov","email":"barbara@example.com"}
{"name":"Invalid address","email":"not-an-email"}
{"name":"Margaret Hamilton","email":"margaret@example.com"}
{"name":"Donald Knuth","email":"donald@example.com"}
{"name":"Alan Kay","email":"alan@example.com"}
{"name":"Bad JSON"
{"name":"Radia Perlman","email":"radia@example.com"}
{"name":"Ken Thompson","email":"ken@example.com"}
{"name":"No Email"}
{"name":"Frances Allen","email":"frances@example.com"}\`;

export function ImportValidationCard() {
  const [content, setContent] = useState(sample);
  const [result, validate] = useAtom(importValidationAtom);
  const event = AsyncResult.getOrElse(result, () => undefined);
  const [events, setEvents] = useState<
    readonly (typeof ImportValidationEvent.Type)[]
  >([]);

  useEffect(() => {
    if (event === undefined) return;
    setEvents((current) =>
      event._tag === "started" ? [event] : [...current, event],
    );
  }, [event]);
  const summary = useMemo(
    () => events.findLast((event) => event._tag === "completed"),
    [events],
  );
  const rows = useMemo(
    () => events.flatMap((event) => (event._tag === "row" ? [event] : [])),
    [events],
  );
  const total = useMemo(
    () => events.find((event) => event._tag === "started")?.total,
    [events],
  );
  const accepted = useMemo(
    () => rows.filter((row) => row.accepted).length,
    [rows],
  );
  const recentRows = useMemo(() => rows.slice(-5).reverse(), [rows]);
  const issues = useMemo(
    () => rows.flatMap((row) => (row.issue === undefined ? [] : [row.issue])),
    [rows],
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle>Streaming import validation</CardTitle>
        <p className="text-muted-foreground text-sm">
          JSONL rows are validated in a Worker and streamed back as progress.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <textarea
          aria-label="JSONL import rows"
          className="min-h-28 w-full resize-none rounded-md border bg-background p-3 font-mono text-sm"
          onChange={(event) => setContent(event.target.value)}
          value={content}
        />
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setEvents([]);
              validate(content);
            }}
          >
            Validate import
          </Button>
          <Button onClick={() => validate(Atom.Interrupt)} variant="outline">
            Cancel
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/40 p-3 text-sm">
          {summary ? (
            <p>Completed: {summary.total} rows processed.</p>
          ) : total === undefined ? (
            <p className="text-muted-foreground">
              Run validation to receive rolling Worker RPC events.
            </p>
          ) : (
            <p>
              Processing {rows.length} of {total} rows…
            </p>
          )}
          {total !== undefined && (
            <p className="mt-2 text-muted-foreground">
              {accepted} accepted, {issues.length} rejected
            </p>
          )}
          {recentRows.length > 0 && (
            <ol className="mt-2 space-y-1 font-mono text-xs">
              {recentRows.map((row) => (
                <li key={row.line}>
                  Line {row.line}: {row.accepted ? "accepted" : "rejected"}
                </li>
              ))}
            </ol>
          )}
          {issues.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-destructive">
              {issues.map((issue) => (
                <li key={issue.line}>
                  Line {issue.line}: {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
`;
