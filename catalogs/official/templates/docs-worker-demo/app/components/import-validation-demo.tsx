import { useAtom } from "@effect/atom-react";
import { Match } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { useId, useState } from "react";
import { importValidationAtom } from "../lib/import-validation-worker";
import type { ImportValidationEvent } from "../workers/import-validation/domain";
import { Button } from "./ui/button";

const sample = `{"name":"Ada Lovelace","email":"ada@example.com"}
{"name":"Missing email"}
{"name":"Grace Hopper","email":"grace@example.com"}`;

const describeEvent = (value: ImportValidationEvent) =>
  Match.valueTags(value, {
    started: (event) => `Validating ${event.total} rows…`,
    accepted: (event) => `Line ${event.line}: accepted.`,
    rejected: (event) => `Line ${event.line}: ${event.issue}`,
    completed: (event) => `Completed: ${event.total} rows processed.`,
  });

export const ImportValidationDemo = () => {
  const inputId = useId();
  const [content, setContent] = useState(sample);
  const [result, validate] = useAtom(importValidationAtom);
  const event = AsyncResult.getOrElse(result, () => undefined);

  return (
    <div className="not-typeset my-4 space-y-3 rounded-md border border-border p-4">
      <label htmlFor={inputId} className="block font-medium">
        JSONL import rows
      </label>
      <textarea
        id={inputId}
        className="block min-h-28 w-full rounded-md border border-border bg-background p-3 font-mono text-sm"
        onChange={(input) => setContent(input.target.value)}
        value={content}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => validate(content)}>Validate rows</Button>
        <Button variant="outline" onClick={() => validate(Atom.Interrupt)}>
          Cancel
        </Button>
      </div>
      <p role="status">
        {AsyncResult.isFailure(result) && "Validation failed."}
        {!AsyncResult.isFailure(result) &&
          (event
            ? describeEvent(event)
            : "Run validation to see progress from the worker.")}
      </p>
    </div>
  );
};
