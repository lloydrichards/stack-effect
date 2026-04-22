import type {
  Blueprint,
  ResolvedRepoModule,
  ResolvedTarget,
} from "@repo/domain/Blueprint";
import {
  mergePlanCauses,
  type PlanCause,
  toPlanRepoModuleCauses,
  toPlanTargetCauses,
  toPlanTargetCompositionCauses,
  toPlanTargetModuleCauses,
} from "@repo/domain/Plan";

export const sortPaths = (left: string, right: string) => {
  const leftParts = left.split("/");
  const rightParts = right.split("/");
  const length = Math.min(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];

    if (leftPart === undefined || rightPart === undefined) {
      continue;
    }

    const compared = leftPart.localeCompare(rightPart);

    if (compared !== 0) {
      return compared;
    }
  }

  return leftParts.length - rightParts.length;
};

const sortCauses = (
  causes: ReadonlyArray<PlanCause>,
): [PlanCause, ...Array<PlanCause>] =>
  [...causes].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  ) as [PlanCause, ...Array<PlanCause>];

export const collectDirectoryPaths = (paths: ReadonlyArray<string>) => {
  const directories = new Set<string>();

  for (const path of paths) {
    const parts = path.split("/");

    for (let index = 1; index < parts.length; index += 1) {
      directories.add(parts.slice(0, index).join("/"));
    }
  }

  return [...directories].sort(sortPaths);
};

type ProjectedPlanPath = {
  readonly path: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonExport = {
  readonly exportKey: string;
  readonly exportValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonDependency = {
  readonly section: "dependencies" | "devDependencies";
  readonly dependencyName: string;
  readonly dependencyValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedPackageJsonScript = {
  readonly scriptName: string;
  readonly scriptValue: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedBarrelExport = {
  readonly exportPath: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type ProjectedTsconfig = {
  readonly path: string;
  readonly contents: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
};

export type PlanChangesetPath = {
  readonly path: string;
  readonly causes: readonly [PlanCause, ...Array<PlanCause>];
  readonly authoritativeContents: string | undefined;
  readonly packageJsonExports: ReadonlyArray<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: ReadonlyArray<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: ReadonlyArray<ProjectedPackageJsonScript>;
  readonly barrelExports: ReadonlyArray<ProjectedBarrelExport>;
  readonly tsconfig: ProjectedTsconfig | undefined;
};

export type PlanChangeset = {
  readonly paths: ReadonlyArray<PlanChangesetPath>;
};

export type PlanChangesetOperationFamily =
  | "authoritative"
  | "packageJson"
  | "barrel"
  | "tsconfig";

export type MutablePlanChangesetPath = {
  readonly path: string;
  causes: readonly [PlanCause, ...Array<PlanCause>];
  family?: PlanChangesetOperationFamily;
  authoritativeContents?: string;
  readonly packageJsonExports: Array<ProjectedPackageJsonExport>;
  readonly packageJsonDependencies: Array<ProjectedPackageJsonDependency>;
  readonly packageJsonScripts: Array<ProjectedPackageJsonScript>;
  readonly barrelExports: Array<ProjectedBarrelExport>;
  tsconfig?: ProjectedTsconfig;
};

const appendProjectedPath = (
  projectedPaths: Map<string, ProjectedPlanPath>,
  path: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedPaths.get(path);

  projectedPaths.set(path, {
    path,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedPackageJsonExport = (
  projectedExports: Map<string, ProjectedPackageJsonExport>,
  exportKey: string,
  exportValue: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedExports.get(exportKey);

  projectedExports.set(exportKey, {
    exportKey,
    exportValue,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedPackageJsonDependency = (
  projectedDependencies: Map<string, ProjectedPackageJsonDependency>,
  dependency: ProjectedPackageJsonDependency,
) => {
  const key = `${dependency.section}:${dependency.dependencyName}`;
  const current = projectedDependencies.get(key);

  projectedDependencies.set(key, {
    section: dependency.section,
    dependencyName: dependency.dependencyName,
    dependencyValue: dependency.dependencyValue,
    causes: current
      ? mergePlanCauses(current.causes, dependency.causes)
      : sortCauses(dependency.causes),
  });
};

const appendProjectedPackageJsonScript = (
  projectedScripts: Map<string, ProjectedPackageJsonScript>,
  script: ProjectedPackageJsonScript,
) => {
  const current = projectedScripts.get(script.scriptName);

  projectedScripts.set(script.scriptName, {
    scriptName: script.scriptName,
    scriptValue: script.scriptValue,
    causes: current
      ? mergePlanCauses(current.causes, script.causes)
      : sortCauses(script.causes),
  });
};

const appendProjectedBarrelExport = (
  projectedBarrelExports: Map<string, ProjectedBarrelExport>,
  exportPath: string,
  causes: ReadonlyArray<PlanCause>,
) => {
  const current = projectedBarrelExports.get(exportPath);

  projectedBarrelExports.set(exportPath, {
    exportPath,
    causes: current
      ? mergePlanCauses(current.causes, causes)
      : sortCauses(causes),
  });
};

const appendProjectedTsconfig = (
  projectedTsconfigs: Map<string, ProjectedTsconfig>,
  projectedTsconfig: ProjectedTsconfig,
) => {
  const current = projectedTsconfigs.get(projectedTsconfig.path);

  projectedTsconfigs.set(projectedTsconfig.path, {
    path: projectedTsconfig.path,
    contents: projectedTsconfig.contents,
    causes: current
      ? mergePlanCauses(current.causes, projectedTsconfig.causes)
      : sortCauses(projectedTsconfig.causes),
  });
};

const packageDomainTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["dist", "build", "node_modules"]
}
`;

const serverTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*", "../../packages/ai/src/LanguageModel.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

const rootBootstrapFiles = {
  ".gitignore": "node_modules\n",
  "package.json": '{"private":true}',
  "packages/config-typescript/base.json": '{"compilerOptions":{}}',
  "turbo.json": '{"$schema":"https://turbo.build/schema.json"}',
} as const;

const serverIndexContents = `import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { ChatServiceLive, FastModelLive, SampleToolkitLive } from "@repo/ai";
import { Api } from "@repo/domain/Api";
import { EventRpc } from "@repo/domain/Rpc";
import { WebSocketRpc } from "@repo/domain/WebSocket";
import { ObservabilityLive } from "@repo/observability";
import { PresenceServiceLive } from "@repo/presence";
import { Config, Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import { HealthGroupLive } from "./Api/Health";
import { HelloGroupLive } from "./Api/Hello";
import { EventRpcLive } from "./Rpc/Event";
import { PresenceRpcLive } from "./Rpc/Presence";

// ============================================================================
// Server Configuration
// ============================================================================

const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(9000)),
  hostname: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.number("IDLE_TIMEOUT").pipe(Config.withDefault(120)), // seconds (Bun default is 10)
  allowedOrigins: Config.string("ALLOWED_ORIGINS").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
  enableDevTools: Config.boolean("DEVTOOLS").pipe(Config.withDefault(false)),
});

// ============================================================================
// Router Composition
// ============================================================================

// HTTP API Router
const ApiRouter = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthGroupLive, HelloGroupLive]),
);

// HTTP RPC Router (for EventRpc - streaming over HTTP)
const HttpRpcRouter = RpcServer.layerHttp({
  group: EventRpc,
  path: "/rpc",
  protocol: "http", // Use HTTP for EventRpc
  spanPrefix: "rpc",
}).pipe(
  Layer.provide(EventRpcLive),
  Layer.provide(ChatServiceLive),
  Layer.provide(SampleToolkitLive),
  Layer.provide(FastModelLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

// WebSocket RPC Router (for PresenceRpc - real-time presence)
const WebSocketRpcRouter = RpcServer.layerHttp({
  group: WebSocketRpc,
  path: "/ws",
  protocol: "websocket", // Use WebSocket for PresenceRpc!
  spanPrefix: "ws",
  disableFatalDefects: true,
}).pipe(
  Layer.provide(PresenceRpcLive),
  Layer.provide(PresenceServiceLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

// ============================================================================
// Server Launch
// ============================================================================

const DevToolsLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (!config.enableDevTools) {
    return Layer.empty;
  }
  yield* Effect.log("Enabling DevTools Layer");
  return DevTools.layer();
}).pipe(Layer.unwrap);

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const allowedOrigins = config.allowedOrigins.split(",").map((o) => o.trim());

  yield* Effect.log("CORS allowed origins: " + allowedOrigins.join(", "));
  yield* Effect.log("Starting server with:");
  yield* Effect.log("  - HTTP API at /");
  yield* Effect.log("  - HTTP RPC at /rpc (EventRpc)");
  yield* Effect.log("  - WebSocket RPC at /ws (PresenceRpc)");

  const AllRouters = Layer.mergeAll(
    ApiRouter,
    HttpRpcRouter,
    WebSocketRpcRouter,
  ).pipe(
    Layer.provide(
      HttpRouter.cors({
        allowedOrigins,
        allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "B3", "traceparent"],
        credentials: true,
      }),
    ),
  );

  return HttpRouter.serve(AllRouters).pipe(
    HttpServer.withLogAddress,
    Layer.provideMerge(DevToolsLive),
    Layer.provideMerge(ObservabilityLive),
    Layer.provideMerge(BunHttpServer.layerConfig(ServerConfig)),
  );
}).pipe(Layer.unwrap, Layer.launch);

BunRuntime.runMain(HttpLive);
`;

const serverHelloContents = `import { Api, type ApiResponse } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

export const HelloGroupLive = HttpApiBuilder.group(Api, "hello", (handlers) =>
  handlers.handle("get", () => {
    const data: typeof ApiResponse.Type = {
      message: "Hello bEvr!",
      success: true,
    };
    return Effect.succeed(data);
  }),
);
`;

const serverHealthContents = `import { Api } from "@repo/domain/Api";
import { Effect } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
export const HealthGroupLive = HttpApiBuilder.group(Api, "health", (handlers) =>
  handlers.handle("get", () => Effect.succeed("Hello Effect!")),
);
`;

const domainApiContents = `import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

export const ApiResponse = Schema.Struct({
  message: Schema.String,
  success: Schema.Literal(true),
});

// Define Domain of API
export class HealthGroup extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("get", "/", { success: Schema.String }))
  .prefix("/") {}

export class HelloGroup extends HttpApiGroup.make("hello")
  .add(HttpApiEndpoint.get("get", "/", { success: ApiResponse }))
  .prefix("/hello") {}

export const Api = HttpApi.make("Api").add(HealthGroup).add(HelloGroup);
`;

const isServerTarget = (target: ResolvedTarget) =>
  target.id === "apps/server-api";

const isDomainPackageTarget = (target: ResolvedTarget) =>
  target.id === "packages/domain";

const toRootBootstrapCauses = (
  repoModule: ResolvedRepoModule,
): readonly [PlanCause, ...Array<PlanCause>] =>
  toPlanRepoModuleCauses({ repoModule });

const getRepoOnlyRootBootstrapCauses = (blueprint: Blueprint) => {
  if (blueprint.nodes.length > 0) {
    return undefined;
  }

  const rootBootstrap = blueprint.modules.find(
    (repoModule) => repoModule.moduleId === "root-bootstrap",
  );

  return rootBootstrap === undefined
    ? undefined
    : toRootBootstrapCauses(rootBootstrap);
};

const collectProjectedRootBootstrapPaths = (blueprint: Blueprint) => {
  const rootBootstrapCauses = getRepoOnlyRootBootstrapCauses(blueprint);

  if (rootBootstrapCauses === undefined) {
    return [];
  }

  return Object.keys(rootBootstrapFiles)
    .sort(sortPaths)
    .map((path) => ({
      path,
      causes: rootBootstrapCauses,
    })) satisfies Array<ProjectedPlanPath>;
};

const projectServerTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();
  const targetCauses = toPlanTargetCauses({ target });

  appendProjectedPath(projectedPaths, "apps/server/package.json", targetCauses);
  appendProjectedPath(
    projectedPaths,
    "apps/server/tsconfig.json",
    targetCauses,
  );
  appendProjectedPath(projectedPaths, "apps/server/src/index.ts", targetCauses);

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "http-api-server") {
      continue;
    }

    const targetModuleCauses = toPlanTargetModuleCauses({
      targetId: target.id,
      targetModule,
    });

    appendProjectedPath(
      projectedPaths,
      "apps/server/src/index.ts",
      targetModuleCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Health.ts",
      targetModuleCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "apps/server/src/Api/Hello.ts",
      targetModuleCauses,
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

const projectDomainPackageTargetPaths = (target: ResolvedTarget) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();
  const targetCauses = toPlanTargetCauses({ target });

  appendProjectedPath(
    projectedPaths,
    "packages/domain/package.json",
    targetCauses,
  );
  appendProjectedPath(
    projectedPaths,
    "packages/domain/tsconfig.json",
    targetCauses,
  );

  if (
    target.composition?._tag === "package" &&
    target.composition.publicEntrypoint === "./Api"
  ) {
    const compositionCauses = toPlanTargetCompositionCauses({
      target,
      composition: target.composition,
    });

    appendProjectedPath(
      projectedPaths,
      "packages/domain/package.json",
      compositionCauses,
    );
    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/index.ts",
      compositionCauses,
    );
  }

  for (const targetModule of target.targetModules) {
    if (targetModule.moduleId !== "domain-api") {
      continue;
    }

    appendProjectedPath(
      projectedPaths,
      "packages/domain/src/Api.ts",
      toPlanTargetModuleCauses({
        targetId: target.id,
        targetModule,
      }),
    );
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

export const collectProjectedPlanPaths = (blueprint: Blueprint) => {
  const projectedPaths = new Map<string, ProjectedPlanPath>();

  for (const projectedPath of collectProjectedRootBootstrapPaths(blueprint)) {
    appendProjectedPath(
      projectedPaths,
      projectedPath.path,
      projectedPath.causes,
    );
  }

  for (const target of blueprint.nodes) {
    const targetProjectedPaths = (() => {
      if (isServerTarget(target)) {
        return projectServerTargetPaths(target);
      }

      if (isDomainPackageTarget(target)) {
        return projectDomainPackageTargetPaths(target);
      }

      return [];
    })();

    for (const projectedPath of targetProjectedPaths) {
      appendProjectedPath(
        projectedPaths,
        projectedPath.path,
        projectedPath.causes,
      );
    }
  }

  return [...projectedPaths.values()].sort((left, right) =>
    sortPaths(left.path, right.path),
  );
};

export const collectProjectedContents = (blueprint: Blueprint) => {
  const projectedContents = new Map<string, string>(
    Object.entries(rootBootstrapFiles)
      .filter(() => getRepoOnlyRootBootstrapCauses(blueprint) !== undefined)
      .map(([path, contents]) => [path, contents] as const),
  );

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      projectedContents.set("apps/server/src/index.ts", serverIndexContents);

      for (const targetModule of target.targetModules) {
        if (targetModule.moduleId !== "http-api-server") {
          continue;
        }

        projectedContents.set(
          "apps/server/src/Api/Health.ts",
          serverHealthContents,
        );
        projectedContents.set(
          "apps/server/src/Api/Hello.ts",
          serverHelloContents,
        );
      }
    }

    if (!isDomainPackageTarget(target)) {
      continue;
    }

    for (const targetModule of target.targetModules) {
      if (targetModule.moduleId !== "domain-api") {
        continue;
      }

      projectedContents.set("packages/domain/src/Api.ts", domainApiContents);
    }
  }

  return projectedContents;
};

export const collectProjectedPackageJsonExports = (blueprint: Blueprint) => {
  const projectedExportsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonExport>
  >();

  for (const target of blueprint.nodes) {
    if (
      !isDomainPackageTarget(target) ||
      target.composition?._tag !== "package" ||
      target.composition.publicEntrypoint !== "./Api"
    ) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathExports =
      projectedExportsByPath.get(path) ??
      new Map<string, ProjectedPackageJsonExport>();
    const compositionCauses = toPlanTargetCompositionCauses({
      target,
      composition: target.composition,
    });

    appendProjectedPackageJsonExport(
      pathExports,
      "./Api",
      "./src/Api.ts",
      compositionCauses,
    );
    projectedExportsByPath.set(path, pathExports);
  }

  return new Map(
    [...projectedExportsByPath.entries()].map(([path, projectedExports]) => [
      path,
      [...projectedExports.values()].sort((left, right) =>
        left.exportKey.localeCompare(right.exportKey),
      ),
    ]),
  );
};

export const collectProjectedPackageJsonDependencies = (
  blueprint: Blueprint,
) => {
  const projectedDependenciesByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonDependency>
  >();

  for (const target of blueprint.nodes) {
    if (!isDomainPackageTarget(target)) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathDependencies =
      projectedDependenciesByPath.get(path) ??
      new Map<string, ProjectedPackageJsonDependency>();
    const targetCauses = toPlanTargetCauses({ target });

    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "dependencies",
      dependencyName: "effect",
      dependencyValue: "4.0.0-beta.47",
      causes: targetCauses,
    });
    appendProjectedPackageJsonDependency(pathDependencies, {
      section: "devDependencies",
      dependencyName: "@repo/config-typescript",
      dependencyValue: "workspace:*",
      causes: targetCauses,
    });
    projectedDependenciesByPath.set(path, pathDependencies);
  }

  return new Map(
    [...projectedDependenciesByPath.entries()].map(
      ([path, projectedDependencies]) => [
        path,
        [...projectedDependencies.values()].sort((left, right) => {
          const sectionCompared = left.section.localeCompare(right.section);

          if (sectionCompared !== 0) {
            return sectionCompared;
          }

          return left.dependencyName.localeCompare(right.dependencyName);
        }),
      ],
    ),
  );
};

export const collectProjectedPackageJsonScripts = (blueprint: Blueprint) => {
  const projectedScriptsByPath = new Map<
    string,
    Map<string, ProjectedPackageJsonScript>
  >();

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      const path = "apps/server/package.json";
      const pathScripts =
        projectedScriptsByPath.get(path) ??
        new Map<string, ProjectedPackageJsonScript>();
      const targetCauses = toPlanTargetCauses({ target });

      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build",
        scriptValue:
          "bun build src/index.ts --outdir=dist --target=bun --minify",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "build:types",
        scriptValue: "tsc --emitDeclarationOnly",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "dev",
        scriptValue: "bun --watch run src/index.ts",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "test",
        scriptValue: "vitest run",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "type-check",
        scriptValue: "tsc --noEmit",
        causes: targetCauses,
      });
      appendProjectedPackageJsonScript(pathScripts, {
        scriptName: "clean",
        scriptValue: "git clean -xdf .cache .turbo dist node_modules",
        causes: targetCauses,
      });
      projectedScriptsByPath.set(path, pathScripts);
      continue;
    }

    if (!isDomainPackageTarget(target)) {
      continue;
    }

    const path = "packages/domain/package.json";
    const pathScripts =
      projectedScriptsByPath.get(path) ??
      new Map<string, ProjectedPackageJsonScript>();
    const targetCauses = toPlanTargetCauses({ target });

    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "type-check",
      scriptValue: "tsc --noEmit",
      causes: targetCauses,
    });
    appendProjectedPackageJsonScript(pathScripts, {
      scriptName: "clean",
      scriptValue:
        "git clean -xdf .cache .turbo dist node_modules tsconfig.tsbuildinfo",
      causes: targetCauses,
    });
    projectedScriptsByPath.set(path, pathScripts);
  }

  return new Map(
    [...projectedScriptsByPath.entries()].map(([path, projectedScripts]) => [
      path,
      [...projectedScripts.values()].sort((left, right) =>
        left.scriptName.localeCompare(right.scriptName),
      ),
    ]),
  );
};

export const collectProjectedBarrelExports = (blueprint: Blueprint) => {
  const projectedBarrelExportsByPath = new Map<
    string,
    Map<string, ProjectedBarrelExport>
  >();

  for (const target of blueprint.nodes) {
    if (
      !isDomainPackageTarget(target) ||
      target.composition?._tag !== "package" ||
      target.composition.publicEntrypoint !== "./Api"
    ) {
      continue;
    }

    const path = "packages/domain/src/index.ts";
    const pathBarrelExports =
      projectedBarrelExportsByPath.get(path) ??
      new Map<string, ProjectedBarrelExport>();

    appendProjectedBarrelExport(
      pathBarrelExports,
      "./Api",
      toPlanTargetCompositionCauses({
        target,
        composition: target.composition,
      }),
    );
    projectedBarrelExportsByPath.set(path, pathBarrelExports);
  }

  return new Map(
    [...projectedBarrelExportsByPath.entries()].map(
      ([path, projectedBarrelExports]) => [
        path,
        [...projectedBarrelExports.values()].sort((left, right) =>
          left.exportPath.localeCompare(right.exportPath),
        ),
      ],
    ),
  );
};

export const collectProjectedTsconfigs = (blueprint: Blueprint) => {
  const projectedTsconfigs = new Map<string, ProjectedTsconfig>();

  for (const target of blueprint.nodes) {
    if (isServerTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "apps/server/tsconfig.json",
        contents: serverTsconfigContents,
        causes: toPlanTargetCauses({ target }),
      });
      continue;
    }

    if (isDomainPackageTarget(target)) {
      appendProjectedTsconfig(projectedTsconfigs, {
        path: "packages/domain/tsconfig.json",
        contents: packageDomainTsconfigContents,
        causes: toPlanTargetCauses({ target }),
      });
    }
  }

  return new Map(projectedTsconfigs.entries());
};

export const getOrCreatePlanChangesetPath = (
  changesetPaths: Map<string, MutablePlanChangesetPath>,
  path: string,
  causes: readonly [PlanCause, ...Array<PlanCause>],
) => {
  const current = changesetPaths.get(path);

  if (current !== undefined) {
    current.causes = mergePlanCauses(current.causes, causes);
    return current;
  }

  const next: MutablePlanChangesetPath = {
    path,
    causes,
    packageJsonExports: [],
    packageJsonDependencies: [],
    packageJsonScripts: [],
    barrelExports: [],
  };

  changesetPaths.set(path, next);
  return next;
};

export const nameFromPath = (path: string) => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};
