import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import type { CatalogSources } from "@repo/domain/CatalogSource";
import {
  CatalogCache,
  CatalogLoader,
  type LoadedCatalogSet,
} from "@repo/scaffold/browser";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/http";
import { useEffect, useMemo, useState } from "react";
import { registryUrl } from "~/workers/recipe-builder/registry-url";
import { catalogModel } from "./selection";

const layer = CatalogLoader.layer.pipe(
  Layer.provide(CatalogCache.memory),
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(BrowserCrypto.layer),
);
export const usePrototypeCatalog = (sources: CatalogSources) => {
  const [result, setResult] = useState<{
    loaded?: LoadedCatalogSet;
    error?: string;
    key: string;
  }>({ key: "" });
  const key = JSON.stringify(sources);
  useEffect(() => {
    const controller = new AbortController();
    const program = Effect.gen(function* () {
      const loader = yield* CatalogLoader;
      return yield* loader.loadSources({
        sources,
        officialUrl: registryUrl(
          window.location.origin,
          import.meta.env.BASE_URL,
        ),
      });
    }).pipe(
      Effect.provide(layer),
      Effect.match({
        onFailure: (failure) => {
          if (!controller.signal.aborted)
            setResult({ key, error: String(failure) });
        },
        onSuccess: (loaded) => {
          if (!controller.signal.aborted) setResult({ key, loaded });
        },
      }),
    );
    void Effect.runPromiseExit(program, { signal: controller.signal });
    return () => controller.abort();
  }, [key, sources]);
  const model = useMemo(
    () => (result.loaded ? catalogModel(result.loaded.catalog) : undefined),
    [result.loaded],
  );
  return result.key === key
    ? { ...result, model }
    : { key, loaded: undefined, model: undefined, error: undefined };
};
