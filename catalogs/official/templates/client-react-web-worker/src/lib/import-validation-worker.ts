import * as BrowserWorker from "@effect/platform-browser/BrowserWorker";
import { Effect, Layer, Stream } from "effect";
import { type Atom, AtomRpc } from "effect/reactivity";
import { RpcClient } from "effect/rpc";
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
