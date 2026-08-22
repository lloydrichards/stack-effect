import {
  GenerationDomainAdapterId,
  type GenerationDomainDefinition,
  GenerationDomainId,
  GenerationDomainOptionId,
  type GenerationDomainTargetAdapter,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import { alchemyRunContents } from "./content/infrastructure";

export const generationDomainRegistry: ReadonlyArray<
  typeof GenerationDomainDefinition.Type
> = [
  {
    id: GenerationDomainId.make("infrastructure"),
    title: "Infrastructure",
    options: [
      {
        id: GenerationDomainOptionId.make("cloudflare"),
        title: "Cloudflare",
        minimumBindings: 1,
        maximumBindings: 1,
        rootContributions: [
          ...[
            ["alchemy", "2.0.0-beta.73"],
            ["effect", "4.0.0-rc.111"],
            ["@effect/platform-node", "4.0.0-rc.111"],
            ["@effect/platform-bun", "4.0.0-rc.111"],
          ].map(([name, value]) => ({
            _tag: "pkg-json-entry" as const,
            path: "package.json",
            field: "dependencies" as const,
            name: name!,
            value: value!,
          })),
          ...[
            ["infra:plan", "alchemy plan"],
            ["infra:dev", "alchemy dev"],
            ["infra:deploy", "alchemy deploy"],
            ["infra:destroy", "alchemy destroy"],
          ].map(([name, value]) => ({
            _tag: "pkg-json-entry" as const,
            path: "package.json",
            field: "scripts" as const,
            name: name!,
            value: value!,
          })),
        ],
        nextSteps: [
          "Run infra:dev for credential-free local Alchemy startup; it must not contact Cloudflare.",
          "Before infra:plan, infra:deploy, or infra:destroy, supply credentials through Alchemy and Cloudflare's documented external configuration.",
          "Those remote commands may inspect, create, mutate, or delete real provider state and are not covered by local acceptance.",
          "Local acceptance does not prove workers.dev, edge upload, TLS, global routing, provider authentication, or remote destroy.",
          "Never place secrets in generated source or public Vite configuration.",
        ],
      },
    ],
  },
];

export const generationDomainTargetAdapterRegistry: ReadonlyArray<
  typeof GenerationDomainTargetAdapter.Type
> = [
  {
    domainId: GenerationDomainId.make("infrastructure"),
    optionId: GenerationDomainOptionId.make("cloudflare"),
    adapterId: GenerationDomainAdapterId.make("cloudflare-website-vite"),
    targetKind: TargetKind.make("client-react"),
    supportedSelectedModules: [
      ModuleId.make("client-react-web-worker"),
      ModuleId.make("client-react-devtools"),
    ],
    supportedResolvedModules: [
      ModuleId.make("config-typescript-vite"),
      ModuleId.make("client-react-web-worker"),
      ModuleId.make("client-react-devtools"),
    ],
    contributions: [
      {
        _tag: "file",
        path: "alchemy.run.ts",
        contents: alchemyRunContents,
      },
    ],
  },
];
