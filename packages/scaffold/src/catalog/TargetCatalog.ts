import { CatalogNotFound } from "@repo/domain/Blueprint";
import {
  type DesiredContributions,
  emptyDesiredContributions,
  type TargetKind,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { packageDomainTsconfigContents } from "../registry/content/root-bootstrap";
import {
  serverIndexContents,
  serverTsconfigContents,
} from "../registry/content/server";

const targetDefinitions = new Map<
  typeof TargetKind.Type,
  {
    readonly kind: typeof TargetKind.Type;
    readonly contributions: typeof DesiredContributions.Type;
  }
>([
  [
    "client",
    {
      kind: "client",
      contributions: emptyDesiredContributions(),
    },
  ],
  [
    "server",
    {
      kind: "server",
      contributions: {
        ...emptyDesiredContributions(),
        files: [
          {
            path: "{{targetPath}}/src/index.ts",
            contents: serverIndexContents,
          },
        ],
        scripts: [
          {
            path: "{{targetPath}}/package.json",
            name: "build",
            value: "bun build src/index.ts --outdir=dist --target=bun --minify",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "build:types",
            value: "tsc --emitDeclarationOnly",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "dev",
            value: "bun --watch run src/index.ts",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "test",
            value: "vitest run",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "type-check",
            value: "tsc --noEmit",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "clean",
            value: "git clean -xdf .cache .turbo dist node_modules",
          },
        ],
        tsconfigs: [
          {
            path: "{{targetPath}}/tsconfig.json",
            contents: serverTsconfigContents,
          },
        ],
      },
    },
  ],
  [
    "cli",
    {
      kind: "cli",
      contributions: emptyDesiredContributions(),
    },
  ],
  [
    "package",
    {
      kind: "package",
      contributions: {
        ...emptyDesiredContributions(),
        scripts: [
          {
            path: "{{targetPath}}/package.json",
            name: "type-check",
            value: "tsc --noEmit",
          },
          {
            path: "{{targetPath}}/package.json",
            name: "clean",
            value:
              "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
          },
        ],
        tsconfigs: [
          {
            path: "{{targetPath}}/tsconfig.json",
            contents: packageDomainTsconfigContents,
          },
        ],
      },
    },
  ],
]);

export class TargetCatalog extends Context.Service<TargetCatalog>()(
  "TargetCatalog",
  {
    make: Effect.succeed({
      getTargetDefinition: (kind: typeof TargetKind.Type) =>
        Effect.fromNullishOr(targetDefinitions.get(kind)).pipe(
          Effect.mapError(
            () =>
              new CatalogNotFound({
                catalog: "target",
                entity: "target-kind",
                id: kind,
              }),
          ),
        ),
    }),
  },
) {
  static readonly layer = Layer.effect(TargetCatalog)(TargetCatalog.make);
}
