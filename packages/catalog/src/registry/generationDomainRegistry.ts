import {
  GenerationDomainAdapterId,
  type GenerationDomainDefinition,
  GenerationDomainId,
  GenerationDomainOptionId,
  type GenerationDomainTargetAdapter,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";

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
        rootContributions: [],
        nextSteps: [],
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
    contributions: [],
  },
];
