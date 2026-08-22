import assert from "node:assert/strict";
import { layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { BlueprintFailure } from "@repo/domain/Blueprint";
import {
  Contribution,
  GenerationDomainAdapterId,
  GenerationDomainId,
  GenerationDomainOptionId,
  ModuleDependency,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";
import { ContributionResolver } from "../plan/ContributionResolver";
import { generationDomainMetadata } from "../plan/PlanService";
import { BlueprintService } from "./BlueprintService";

const cloudflare = {
  id: GenerationDomainId.make("infrastructure"),
  option: GenerationDomainOptionId.make("cloudflare"),
};
const target = (
  kind: string,
  name: string,
  modules: ReadonlyArray<string> = [],
) => ({
  identity: new TargetIdentity({ kind: TargetKind.make(kind), name }),
  modules: modules.map((id) => ({ id: ModuleId.make(id) })),
});

describe("generic generation-domain binding", () => {
  layer(BlueprintService.layer)("resolve", (it) => {
    it.effect(
      "binds exactly the explicitly selected React identity and preserves its path",
      () =>
        Effect.gen(function* () {
          const service = yield* BlueprintService;
          const blueprint = yield* service.resolve({
            targets: [
              target("workspace", "demo"),
              target("client-react", "marketing", ["client-react-web-worker"]),
            ],
            domains: [cloudflare],
          });
          expect(blueprint.domainBindings).toEqual([
            {
              domainId: "infrastructure",
              optionId: "cloudflare",
              targetId: "apps/client-react-marketing",
              adapterId: "cloudflare-website-vite",
            },
          ]);
          expect(
            blueprint
              .getTarget("apps/client-react-marketing")
              ?.identity.toPath(),
          ).toBe("apps/client-react-marketing");
        }),
    );

    it.effect(
      "rejects additional deployable targets with the requested identity",
      () =>
        Effect.gen(function* () {
          const service = yield* BlueprintService;
          const exit = yield* Effect.exit(
            service.resolve({
              targets: [target("client-react", "web"), target("server", "api")],
              domains: [cloudflare],
            }),
          );
          assert(Exit.isFailure(exit));
          const error = Cause.squash(exit.cause);
          expect(error).toBeInstanceOf(BlueprintFailure);
          assert(error instanceof BlueprintFailure);
          expect(error).toMatchObject({
            reason: "binding-cardinality",
            domainId: "infrastructure",
            optionId: "cloudflare",
          });
          expect(error).not.toHaveProperty("code");
          expect(error.targetIds).toEqual([
            "apps/client-react-web",
            "apps/server-api",
          ]);
          expect(String(error)).toContain("apps/server-api");
        }),
    );

    it.effect(
      "rejects backend-dependent selected modules while accepting explicit DevTools",
      () =>
        Effect.gen(function* () {
          const service = yield* BlueprintService;
          const accepted = yield* service.resolve({
            targets: [target("client-react", "web", ["client-react-devtools"])],
            domains: [cloudflare],
          });
          expect(accepted.domainBindings?.[0]?.targetId).toBe(
            "apps/client-react-web",
          );
          const exit = yield* Effect.exit(
            service.resolve({
              targets: [
                target("client-react", "web", ["client-react-http-api"]),
              ],
              domains: [cloudflare],
            }),
          );
          assert(Exit.isFailure(exit));
          const error = Cause.squash(exit.cause);
          expect(error).toBeInstanceOf(BlueprintFailure);
          assert(error instanceof BlueprintFailure);
          expect(error).toMatchObject({
            reason: "unsupported-module",
            domainId: "infrastructure",
            optionId: "cloudflare",
            targetId: "apps/client-react-web",
            moduleId: "client-react-http-api",
            moduleSource: "selected",
          });
          expect(String(error)).toContain("client-react-http-api");
        }),
    );
    it.effect(
      "runs a provider-neutral fixture through registry lookup, exact binding, Plan metadata, and contributions",
      () => {
        const domainId = GenerationDomainId.make("delivery");
        const optionId = GenerationDomainOptionId.make("edge-preview");
        const adapterId = GenerationDomainAdapterId.make("static-preview");
        const fixtureLayer = Layer.effect(
          CatalogService,
          Effect.map(CatalogService.make, (catalog) => ({
            ...catalog,
            getModule: (moduleId: typeof ModuleId.Type) =>
              moduleId === "client-react-http-api"
                ? Effect.map(catalog.getModule(moduleId), (definition) => ({
                    ...definition,
                    dependencies: [
                      ...(definition.dependencies ?? []),
                      ModuleDependency.cases["required-target"].make({
                        identity: new TargetIdentity({
                          kind: TargetKind.make("server"),
                          name: "dependency",
                        }),
                      }),
                    ],
                  }))
                : catalog.getModule(moduleId),
            getGenerationDomainOption: (
              id: typeof domainId,
              option: typeof optionId,
            ) =>
              id === domainId && option === optionId
                ? Effect.succeed({
                    id: optionId,
                    title: "Edge preview",
                    minimumBindings: 1,
                    maximumBindings: 1,
                    rootContributions: [
                      Contribution.cases.file.make({
                        path: "fixture-root.txt",
                        contents: "{{targetPath}}",
                      }),
                    ],
                    nextSteps: [],
                  })
                : catalog.getGenerationDomainOption(id, option),
            getGenerationDomainTargetAdapter: (
              id: typeof domainId,
              option: typeof optionId,
              kind: typeof TargetKind.Type,
            ) =>
              id === domainId && option === optionId && kind === "client-react"
                ? Effect.succeed({
                    domainId,
                    optionId,
                    adapterId,
                    targetKind: TargetKind.make("client-react"),
                    supportedSelectedModules: [
                      ModuleId.make("client-react-http-api"),
                    ],
                    supportedResolvedModules: [
                      ModuleId.make("client-react-http-api"),
                      ModuleId.make("config-typescript-vite"),
                    ],
                    contributions: [
                      Contribution.cases.file.make({
                        path: "{{targetPath}}/fixture-adapter.txt",
                        contents: "{{targetPath}}",
                      }),
                    ],
                  })
                : catalog.getGenerationDomainTargetAdapter(id, option, kind),
          })),
        );
        return Effect.gen(function* () {
          const blueprintService = yield* BlueprintService.make.pipe(
            Effect.provide(fixtureLayer),
          );
          const resolver = yield* ContributionResolver.make.pipe(
            Effect.provide(fixtureLayer),
          );
          const blueprint = yield* blueprintService.resolve({
            targets: [
              target("client-react", "preview", ["client-react-http-api"]),
            ],
            domains: [{ id: domainId, option: optionId }],
          });
          expect(blueprint.domainBindings).toHaveLength(1);
          expect(blueprint.domainBindings?.[0]).toMatchObject({
            domainId: "delivery",
            optionId: "edge-preview",
            targetId: "apps/client-react-preview",
            adapterId: "static-preview",
          });
          expect(blueprint.hasTarget("apps/server-dependency")).toBe(true);
          expect(generationDomainMetadata(blueprint)?.[0]?.selection).toEqual({
            id: "delivery",
            option: "edge-preview",
          });
          const contributions = yield* resolver.resolve(
            blueprint,
            new StackConfig({
              name: "fixture",
              runtime: { _tag: "bun" },
            }),
          );
          const domainContributions = contributions.targets.filter(
            (contribution) => contribution.generationDomain !== undefined,
          );
          expect(domainContributions).toEqual([
            {
              targetKey: "apps/client-react-preview",
              generationDomain: {
                domainId: "delivery",
                optionId: "edge-preview",
              },
              contributions: [
                expect.objectContaining({
                  path: "fixture-root.txt",
                  contents: "apps/client-react-preview",
                }),
              ],
            },
            {
              targetKey: "apps/client-react-preview",
              generationDomain: {
                domainId: "delivery",
                optionId: "edge-preview",
                adapterId: "static-preview",
              },
              contributions: [
                expect.objectContaining({
                  path: "apps/client-react-preview/fixture-adapter.txt",
                  contents: "apps/client-react-preview",
                }),
              ],
            },
          ]);
        });
      },
    );

    it.effect(
      "rejects an unsupported resolved module with structured context",
      () => {
        const domainId = GenerationDomainId.make("delivery");
        const optionId = GenerationDomainOptionId.make("strict-preview");
        const fixtureLayer = Layer.effect(
          CatalogService,
          Effect.map(CatalogService.make, (catalog) => ({
            ...catalog,
            getGenerationDomainOption: () =>
              Effect.succeed({
                id: optionId,
                title: "Strict preview",
                minimumBindings: 1,
                maximumBindings: 1,
                rootContributions: [],
                nextSteps: [],
              }),
            getGenerationDomainTargetAdapter: () =>
              Effect.succeed({
                domainId,
                optionId,
                adapterId: GenerationDomainAdapterId.make("strict-static"),
                targetKind: TargetKind.make("client-react"),
                supportedSelectedModules: [
                  ModuleId.make("client-react-http-api"),
                ],
                supportedResolvedModules: [
                  ModuleId.make("config-typescript-vite"),
                ],
                contributions: [],
              }),
          })),
        );

        return Effect.gen(function* () {
          const service = yield* BlueprintService.make.pipe(
            Effect.provide(fixtureLayer),
          );
          const exit = yield* Effect.exit(
            service.resolve({
              targets: [
                target("client-react", "preview", ["client-react-http-api"]),
              ],
              domains: [{ id: domainId, option: optionId }],
            }),
          );
          assert(Exit.isFailure(exit));
          const error = Cause.squash(exit.cause);
          assert(error instanceof BlueprintFailure);
          expect(error).toMatchObject({
            reason: "unsupported-module",
            domainId: "delivery",
            optionId: "strict-preview",
            targetId: "apps/client-react-preview",
            moduleId: "client-react-http-api",
            moduleSource: "resolved",
          });
          expect(String(error)).toContain("Unsupported resolved module");
        });
      },
    );
  });
});
