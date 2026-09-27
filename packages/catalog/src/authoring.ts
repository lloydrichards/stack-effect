import { CatalogDocument } from "@repo/domain/Catalog";
import { Effect, Schema } from "effect";
import {
  validateCatalogCapabilities,
  V1_INTERPRETER_CAPABILITIES,
} from "./CatalogProtocol";
import { CatalogService } from "./CatalogService";
import { composeCatalog } from "./composeCatalog";
import { moduleRegistry } from "./registry/moduleRegistry";
import { targetRegistry } from "./registry/targetRegistry";

/** Local definitions for repository tooling and the temporary bundled clients. */
export const bundledCatalog = {
  targets: targetRegistry,
  modules: moduleRegistry,
};

export const BundledCatalogLayer = CatalogService.fromFragments(
  [bundledCatalog],
  { trustedFragmentIndex: 0 },
);

export const exportOfficialCatalog = Effect.fn("Catalog.exportOfficial")(
  function* () {
    const definitions = yield* composeCatalog([bundledCatalog], {
      trustedFragmentIndex: 0,
    });
    const document: CatalogDocument = {
      formatVersion: 1,
      catalogId: Schema.NonEmptyString.make("stack-effect-official"),
      requiredCapabilities: V1_INTERPRETER_CAPABILITIES,
      ...definitions,
    };
    yield* validateCatalogCapabilities(document);
    const encoded = yield* Schema.encodeEffect(
      Schema.fromJsonString(CatalogDocument),
    )(document);
    return `${encoded}\n`;
  },
);
