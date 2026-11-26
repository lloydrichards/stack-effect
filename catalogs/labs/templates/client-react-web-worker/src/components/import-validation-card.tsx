import { useAtom } from "@effect/atom-react";
import { AsyncResult, Atom } from "effect/reactivity";
import { useEffect, useMemo, useState } from "react";
import { importValidationAtom } from "@/lib/import-validation-worker";
import type { ImportValidationEvent } from "@/workers/import-validation/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sample = `{"name":"Ada Lovelace","email":"ada@example.com"}
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
{"name":"Frances Allen","email":"frances@example.com"}`;

export const ImportValidationCard = () => {
  const [content, setContent] = useState(sample);
  const [result, validate] = useAtom(importValidationAtom);
  const event = AsyncResult.getOrElse(result, () => undefined);
  const [events, setEvents] = useState<ReadonlyArray<ImportValidationEvent>>(
    [],
  );

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
    () =>
      events.filter(
        (event) => event._tag === "accepted" || event._tag === "rejected",
      ),
    [events],
  );
  const total = useMemo(
    () => events.find((event) => event._tag === "started")?.total,
    [events],
  );
  const accepted = useMemo(
    () => rows.filter((row) => row._tag === "accepted").length,
    [rows],
  );
  const recentRows = useMemo(() => rows.slice(-5).reverse(), [rows]);
  const issues = useMemo(
    () => rows.filter((row) => row._tag === "rejected"),
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
          {summary && <p>Completed: {summary.total} rows processed.</p>}
          {!summary && total === undefined && (
            <p className="text-muted-foreground">
              Run validation to receive rolling Worker RPC events.
            </p>
          )}
          {!summary && total !== undefined && (
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
                  Line {row.line}: {row._tag}
                </li>
              ))}
            </ol>
          )}
          {issues.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-destructive">
              {issues.map(({ line, issue }) => (
                <li key={line}>
                  Line {line}: {issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
