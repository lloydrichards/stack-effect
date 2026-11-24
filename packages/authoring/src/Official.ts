/**
 * The official catalog: fetch it so a catalog that requires it can be
 * validated against it.
 */
import { decodeDocument } from "@repo/catalog/Protocol";
import {
  type CatalogDocument,
  OFFICIAL_CATALOG_URL,
} from "@repo/domain/Catalog";
import { Effect, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";

export { OFFICIAL_CATALOG_URL };

/** The official catalog could not be fetched or is not a valid v1 document. */
export class OfficialCatalogUnavailable extends Schema.TaggedError<OfficialCatalogUnavailable>()(
  "OfficialCatalogUnavailable",
  {
    url: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Defect()),
  },
) {}

/**
 * Fetch the official catalog so a catalog that declares `requires:
 * ["official"]` can be validated against it. The caller provides the
 * HttpClient, such as `FetchHttpClient.layer`, so builds stay testable offline.
 */
export const loadOfficialCatalog = Effect.fn("Authoring.loadOfficialCatalog")(
  function* (url: string = OFFICIAL_CATALOG_URL) {
    const client = yield* HttpClient.HttpClient;
    const message = `Could not load the official catalog from ${url}`;
    const json = yield* client
      .get(url, { headers: { accept: "application/json" } })
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap((response) => response.json),
        Effect.mapError(
          (cause) => new OfficialCatalogUnavailable({ url, message, cause }),
        ),
      );
    return yield* decodeDocument(json).pipe(
      Effect.mapError(
        (cause) => new OfficialCatalogUnavailable({ url, message, cause }),
      ),
    ) satisfies Effect.Effect<CatalogDocument, OfficialCatalogUnavailable>;
  },
);
