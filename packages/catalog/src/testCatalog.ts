import {
  CatalogDocument,
  type CatalogFragment,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { Effect, Schema } from "effect";
import { V1_INTERPRETER_CAPABILITIES } from "./CatalogProtocol";
import { composeCatalog } from "./composeCatalog";

const workspace = TargetKind.make("workspace");
const packageKind = TargetKind.make("package");

/** A small self-contained catalog for composition and protocol tests. */
export const testCatalog = {
  targets: [
    {
      kind: workspace,
      title: "Workspace",
      description: "Repository root",
      contributions: [
        {
          _tag: "file",
          path: "package.json",
          contents: '{ "name": "{{projectName}}" }\n',
        },
      ],
    },
    {
      kind: packageKind,
      title: "Package",
      description: "Shared package",
      contributions: [
        {
          _tag: "file",
          path: "{{targetPath}}/package.json",
          contents: '{ "name": "{{packageName}}" }\n',
        },
      ],
    },
  ],
  modules: [
    {
      id: ModuleId.make("workspace-quality-oxlint"),
      title: "Oxlint",
      description: "Lint with Oxlint",
      supportedOn: [{ _tag: "kind", kind: workspace }],
      dependencies: [],
      conflictsWith: [ModuleId.make("workspace-quality-biome")],
      contributions: [
        { _tag: "file", path: ".oxlintrc.json", contents: "{}\n" },
      ],
    },
    {
      id: ModuleId.make("workspace-quality-biome"),
      title: "Biome",
      description: "Lint with Biome",
      supportedOn: [{ _tag: "kind", kind: workspace }],
      dependencies: [],
      conflictsWith: [ModuleId.make("workspace-quality-oxlint")],
      contributions: [{ _tag: "file", path: "biome.json", contents: "{}\n" }],
    },
    {
      id: ModuleId.make("domain-api-contracts"),
      title: "API contracts",
      description: "Shared API schemas",
      supportedOn: [{ _tag: "kind", kind: packageKind }],
      dependencies: [],
      contributions: [
        {
          _tag: "file",
          path: "{{targetPath}}/src/Api.ts",
          contents: "export {};\n",
        },
      ],
    },
    {
      id: ModuleId.make("workspace-api-docs"),
      title: "API docs",
      description: "Documents the shared API",
      supportedOn: [{ _tag: "kind", kind: workspace }],
      dependencies: [
        {
          _tag: "required-module",
          target: new TargetIdentity({ kind: packageKind, name: "domain" }),
          moduleId: ModuleId.make("domain-api-contracts"),
        },
      ],
      contributions: [
        {
          _tag: "file",
          path: "docs/api.md",
          contents: "# {{projectName}}{{#if runtime=bun}} on Bun{{/if}}\n",
        },
      ],
    },
  ],
} satisfies CatalogFragment;

/** The test catalog encoded like a published v1 document. */
export const exportTestCatalog = Effect.fn("Catalog.exportTest")(function* () {
  const definitions = yield* composeCatalog([testCatalog]);
  return yield* Schema.encodeEffect(Schema.fromJsonString(CatalogDocument))({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make("test-catalog"),
    requiredCapabilities: V1_INTERPRETER_CAPABILITIES,
    ...definitions,
  });
});
