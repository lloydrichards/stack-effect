import { V1_INTERPRETER_CAPABILITIES } from "@repo/catalog";
import {
  CatalogDocument,
  ModuleDefinition as ModuleDefinitionSchema,
  ModuleId,
  TargetDefinition as TargetDefinitionSchema,
  TargetKind,
} from "@repo/domain/Catalog";
import { Schema } from "effect";

type TargetDefinition = typeof TargetDefinitionSchema.Type;
type ModuleDefinition = typeof ModuleDefinitionSchema.Type;

const file = (path: string, contents: string) => ({
  _tag: "file" as const,
  path,
  contents,
});

const target = (
  kind: string,
  contributions: TargetDefinition["contributions"] = [],
): TargetDefinition => ({
  kind: TargetKind.make(kind),
  title: `${kind} target`,
  description: `The ${kind} target`,
  defaultName: kind === "workspace" ? undefined : kind,
  contributions,
});

const module = (
  id: string,
  kind: string,
  contributions: ModuleDefinition["contributions"],
  extra: Partial<ModuleDefinition> = {},
): ModuleDefinition => ({
  id: ModuleId.make(id),
  title: `${id} module`,
  description: `The ${id} module`,
  supportedOn: [{ _tag: "kind", kind: TargetKind.make(kind) }],
  dependencies: [],
  contributions,
  ...extra,
});

const document = (
  catalogId: string,
  fragment: {
    readonly targets?: ReadonlyArray<TargetDefinition>;
    readonly modules?: ReadonlyArray<ModuleDefinition>;
    readonly requires?: ReadonlyArray<"official">;
  },
) =>
  Schema.encodeSync(Schema.fromJsonString(CatalogDocument))({
    formatVersion: 1,
    catalogId: Schema.NonEmptyString.make(catalogId),
    // Declared as the authoring package does, so validation matches published catalogs.
    requiredCapabilities: V1_INTERPRETER_CAPABILITIES,
    targets: fragment.targets ?? [],
    modules: fragment.modules ?? [],
    ...(fragment.requires ? { requires: fragment.requires } : {}),
  });

/**
 * Controlled catalogs for the four source sets in the catalog source decision:
 * `ext` extends the official server target, `acme` stands alone with its own
 * workspace, and `beta` stands alone beside it. `clash` collides with `acme`.
 */
export const customCatalogDocuments = {
  ext: document("ext", {
    requires: ["official"],
    modules: [
      module("ext-auth", "server", [
        file(
          "{{targetPath}}/src/ext-auth.ts",
          "export const extAuth = true;\n",
        ),
      ]),
    ],
  }),
  acme: document("acme", {
    targets: [
      target("workspace", [file("README.md", "# Acme workspace\n")]),
      target("api", [
        file("{{targetPath}}/src/index.ts", "export const api = 'acme';\n"),
      ]),
    ],
    modules: [
      module("acme-api-rest", "api", [
        file("{{targetPath}}/src/rest.ts", "export const rest = true;\n"),
      ]),
    ],
  }),
  beta: document("beta", {
    targets: [
      target("worker", [
        file("{{targetPath}}/src/worker.ts", "export const worker = 'beta';\n"),
      ]),
    ],
  }),
  clash: document("clash", {
    targets: [target("api")],
  }),
} as const;

export type CustomCatalogName = keyof typeof customCatalogDocuments;
