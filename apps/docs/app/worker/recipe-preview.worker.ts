/// <reference lib="webworker" />

import { type BuilderCatalogModule, CatalogService } from "@repo/catalog";
import { ModuleCategory } from "@repo/domain/Catalog";
import { toWorkspaceToolValue } from "@repo/scaffold/browser";
import { Effect, Exit, Schema } from "effect";
import { BuilderCatalogRequestSchema } from "./recipe-preview-protocol";

const WorkerRequest = Schema.Struct({
  _tag: Schema.Literals(["preview", "catalog"]),
  id: Schema.String,
  input: Schema.Unknown,
});

type WorkerRequest = typeof WorkerRequest.Type;

type WorkerResponse =
  | {
      readonly _tag: "success";
      readonly id: string;
      readonly output: unknown;
    }
  | {
      readonly _tag: "failure";
      readonly id: string;
      readonly message: string;
    };

type FlatModule = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly visibility: "public" | "internal";
  readonly dependencies: BuilderCatalogModule["dependencies"];
  readonly implications: BuilderCatalogModule["implications"];
  readonly children: ReadonlyArray<{
    readonly requirement: "required" | "optional";
    readonly moduleId: string;
  }>;
};

const flattenModules = (
  modules: ReadonlyArray<BuilderCatalogModule>,
): ReadonlyArray<FlatModule> =>
  Array.from(
    new Map(
      modules
        .flatMap((module) => [
          {
            id: module.id,
            title: module.title,
            description: module.description,
            visibility: module.visibility,
            dependencies: module.dependencies,
            implications: module.implications,
            children: module.children.map((child) => ({
              requirement: child.requirement,
              moduleId: child.module.id,
            })),
          },
          ...flattenModules(module.children.map((child) => child.module)),
        ])
        .map((module) => [module.id, module] as const),
    ).values(),
  );

const preview = (request: WorkerRequest) =>
  Effect.promise(() => import("@repo/scaffold/browser")).pipe(
    Effect.flatMap(
      ({
        RecipePreviewInputSchema,
        RecipePreviewSchema,
        RecipePreviewService,
      }) =>
        Effect.gen(function* () {
          const input = yield* Schema.decodeUnknownEffect(
            RecipePreviewInputSchema,
          )(request.input);
          const previews = yield* RecipePreviewService;
          const output = yield* previews.preview(input);
          return yield* Schema.encodeUnknownEffect(RecipePreviewSchema)(output);
        }).pipe(Effect.provide(RecipePreviewService.layer)),
    ),
  );

const catalog = (request: WorkerRequest) =>
  Effect.gen(function* () {
    const input = yield* Schema.decodeUnknownEffect(
      BuilderCatalogRequestSchema,
    )(request.input);
    const catalogs = yield* CatalogService;
    const projection = yield* catalogs.toBuilderCatalog(input.owners);
    const configurationChoices = (category: string) =>
      catalogs
        .getModules({ category: ModuleCategory.make(category) })
        .map((module) => ({
          id: module.id,
          title: module.title,
          description: module.description,
          value: toWorkspaceToolValue(module.id),
        }));
    return {
      targets: projection.targets,
      targetModules: projection.targetModules.map((target) => ({
        owner: target.owner,
        modules: flattenModules(target.modules),
      })),
      configuration: {
        monorepo: configurationChoices("monorepo"),
        lint: configurationChoices("lint"),
        format: configurationChoices("format"),
        test: configurationChoices("test"),
        developerExperience: catalogs
          .getModules({ category: ModuleCategory.make("devenv") })
          .map((module) => ({
            id: module.id,
            title: module.title,
            description: module.description,
          })),
      },
    };
  }).pipe(Effect.provide(CatalogService.layer));

const worker = self as DedicatedWorkerGlobalScope;

const respond = <A, E, R>(
  request: WorkerRequest,
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.map(
      (output): WorkerResponse => ({
        _tag: "success",
        id: request.id,
        output,
      }),
    ),
  );

worker.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = Exit.match(
    Schema.decodeUnknownExit(WorkerRequest)(event.data),
    {
      onFailure: () => undefined,
      onSuccess: (value) => value,
    },
  );
  if (request === undefined) return;
  const response = (
    request._tag === "preview"
      ? respond(request, preview(request))
      : respond(request, catalog(request))
  ).pipe(
    Effect.matchCauseEffect({
      onFailure: () =>
        Effect.succeed<WorkerResponse>({
          _tag: "failure",
          id: request.id,
          message: "The recipe preview could not be generated.",
        }),
      onSuccess: Effect.succeed,
    }),
  );

  Effect.runPromise(response).then((result) => worker.postMessage(result));
});

export {};
