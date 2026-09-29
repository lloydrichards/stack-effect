import { decodeCatalogDocument } from "@repo/catalog";
import type { CatalogDocument } from "@repo/domain/Catalog";
import { OFFICIAL_CATALOG_URL } from "@repo/domain/CatalogSource";
import { Data, Effect } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

export { OFFICIAL_CATALOG_URL };

/** The official catalog could not be fetched or is not a valid v1 document. */
export class OfficialCatalogUnavailable extends Data.TaggedError(
  "OfficialCatalogUnavailable",
)<{
  readonly url: string;
  readonly message: string;
}> {}

/**
 * Fetch the official catalog so a catalog that declares `requires:
 * ["official"]` can be validated against it. The caller provides the
 * HttpClient, such as `FetchHttpClient.layer`, so builds stay testable offline.
 */
export const loadOfficialCatalog = Effect.fn("Authoring.loadOfficialCatalog")(
  function* (url: string = OFFICIAL_CATALOG_URL) {
    const client = yield* HttpClient.HttpClient;
    const unavailable = (reason: string) =>
      new OfficialCatalogUnavailable({
        url,
        message: `Could not load the official catalog from ${url}: ${reason}`,
      });
    const json = yield* client
      .get(url, { headers: { accept: "application/json" } })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.json),
        Effect.mapError((error) => unavailable(error.message)),
      );
    return yield* decodeCatalogDocument(json).pipe(
      Effect.mapError((error) => unavailable(error.message)),
    ) satisfies Effect.Effect<CatalogDocument, OfficialCatalogUnavailable>;
  },
);
