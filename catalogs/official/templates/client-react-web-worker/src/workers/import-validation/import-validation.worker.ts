/// <reference lib="webworker" />

import * as BrowserWorkerRunner from "@effect/platform-browser/BrowserWorkerRunner";
import { Effect, Layer, Schedule, Stream } from "effect";
import { RpcServer } from "effect/unstable/rpc";
import { ImportValidationRpc, parseImportRecord } from "./domain";

const ImportValidationHandlersLive = ImportValidationRpc.toLayer(
  Effect.succeed(
    ImportValidationRpc.of({
      validate: ({ content }) => {
        const records = content
          .split("\n")
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
    }),
  ),
);

const WorkerLive = RpcServer.layer(ImportValidationRpc).pipe(
  Layer.provide(ImportValidationHandlersLive),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(BrowserWorkerRunner.layer),
);

Effect.runFork(Layer.launch(WorkerLive));
