import { Effect } from "effect";
import { Atom } from "effect/unstable/reactivity";
import {
  RecipePreviewClient,
  RecipePreviewClientLive,
} from "../worker/recipe-preview-client";
import type {
  BuilderCatalogRequestWire,
  RecipePreviewInputWire,
} from "../worker/recipe-preview-protocol";

export type CatalogRequestSource = "identity" | "preview";

export type CatalogAtomRequest = {
  readonly generation: number;
  readonly targetIdentityKey: string;
  readonly owners: BuilderCatalogRequestWire["owners"];
  readonly source: CatalogRequestSource;
};

export type PreviewAtomRequest = {
  readonly generation: number;
  readonly input: RecipePreviewInputWire;
};

export const workerRuntime = Atom.runtime(RecipePreviewClientLive);

export const catalogAtom = workerRuntime.fn(
  Effect.fnUntraced(function* (request: CatalogAtomRequest) {
    const client = yield* RecipePreviewClient;
    const result = yield* client
      .catalog({ input: { owners: request.owners } })
      .pipe(Effect.result);
    return { request, result } as const;
  }),
);

export const previewAtom = workerRuntime.fn(
  Effect.fnUntraced(function* (request: PreviewAtomRequest) {
    yield* Effect.sleep("200 millis");
    const client = yield* RecipePreviewClient;
    const result = yield* client
      .preview({ input: request.input })
      .pipe(Effect.result);
    return { request, result } as const;
  }),
);
