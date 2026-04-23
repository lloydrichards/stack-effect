import { CatalogNotFound } from "@repo/domain/Blueprint";
import {
  type DesiredContributions,
  emptyDesiredContributions,
  type TargetIdentity,
  type TargetKind,
} from "@repo/domain/Scaffold";
import { Context, Effect, Layer } from "effect";
import { packageDomainTsconfigContents } from "../registry/content/root-bootstrap";
import {
  serverIndexContents,
  serverTsconfigContents,
} from "../registry/content/server";

export type TargetDefinition = {
  readonly kind: TargetKind;
  readonly contributions: DesiredContributions;
};

const targetDefinitions = new Map<TargetKind, TargetDefinition>([
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
        packageJsonScripts: [
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "build",
            scriptValue:
              "bun build src/index.ts --outdir=dist --target=bun --minify",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "build:types",
            scriptValue: "tsc --emitDeclarationOnly",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "dev",
            scriptValue: "bun --watch run src/index.ts",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "test",
            scriptValue: "vitest run",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "type-check",
            scriptValue: "tsc --noEmit",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "clean",
            scriptValue: "git clean -xdf .cache .turbo dist node_modules",
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
        packageJsonScripts: [
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "type-check",
            scriptValue: "tsc --noEmit",
          },
          {
            packageJsonPath: "{{targetPath}}/package.json",
            scriptName: "clean",
            scriptValue:
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

const toTargetPath = (identity: TargetIdentity) =>
  identity.kind === "package"
    ? `packages/${identity.name}`
    : `apps/${identity.kind}-${identity.name}`;

export class TargetCatalog extends Context.Service<TargetCatalog>()(
  "TargetCatalog",
  {
    make: Effect.succeed({
      getTargetDefinition: (kind: TargetKind) =>
        Effect.fromNullishOr(targetDefinitions.get(kind)).pipe(
          Effect.catch(() =>
            Effect.fail(
              new CatalogNotFound({
                catalog: "target",
                entity: "target-kind",
                id: kind,
              }),
            ),
          ),
        ),
      deriveTargetPath: (identity: TargetIdentity) =>
        Effect.succeed(toTargetPath(identity)),
    }),
  },
) {
  static readonly layer = Layer.effect(TargetCatalog)(TargetCatalog.make);
}
