export const serverPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "{{#if runtime=bun}}@effect/platform-bun{{/if}}{{#if runtime=node}}@effect/platform-node{{/if}}": "4.0.0-beta.98",
    "effect": "4.0.0-beta.98"
  },
  "devDependencies": {
    "@repo/config-typescript": "{{workspaceDependency}}",
    "{{#if runtime=bun}}@types/bun{{/if}}{{#if runtime=node}}@types/node{{/if}}": "{{#if runtime=bun}}^1.2.17{{/if}}{{#if runtime=node}}^24.0.0{{/if}}",
    "vitest": "^4.1.4"
  }
}
`;

export const serverTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["{{#if runtime=bun}}bun{{/if}}{{#if runtime=node}}node{{/if}}"]
  },
  "include": ["src/**/*", "../../packages/ai/src/LanguageModel.ts"],
  "exclude": ["node_modules", "dist"]
}
`;

/**
 * Server index template with HTTP API support.
 *
 * This is a minimal server template that includes:
 * - Basic HTTP server with CORS
 * - HTTP API router with Health and Hello endpoints
 *
 * Additional capabilities (RPC, WebSocket) are added by modules.
 */
export const serverIndexContents = `{{#if runtime=bun}}import { BunHttpServer, BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";{{/if}}
import { Api } from "@repo/domain/Api";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HealthGroupLive } from "./Api/Health";
import { HelloGroupLive } from "./Api/Hello";

export const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(9000)),
  hostname: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.number("IDLE_TIMEOUT").pipe(Config.withDefault(120)),
  allowedOrigins: Config.string("ALLOWED_ORIGINS").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
});

// HTTP API Router
const ApiRouter = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthGroupLive, HelloGroupLive]),
);

// NOTE: Modules append additional routers through Layer.mergeAll.
const RouterDependencies = Layer.mergeAll(Layer.empty);
const AllRouters = Layer.mergeAll(ApiRouter).pipe(
  Layer.provide(RouterDependencies),
);

// NOTE: Modules append additional server layers through Layer.mergeAll.
const ServerLayers = Layer.mergeAll({{#if runtime=bun}}BunHttpServer.layerConfig(ServerConfig){{/if}}{{#if runtime=node}}NodeHttpServer.layerConfig(createServer, ServerConfig){{/if}});

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const allowedOrigins = config.allowedOrigins.split(",").map((o) => o.trim());

  yield* Effect.logInfo(\`CORS allowed origins: \${allowedOrigins.join(", ")}\`);
  yield* Effect.logInfo("Starting server with:");
  yield* Effect.logInfo("  - HTTP API at /");

  const CorsRouters = AllRouters.pipe(
    Layer.provide(
      HttpRouter.cors({
        allowedOrigins,
        allowedMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "B3", "traceparent"],
        credentials: true,
      }),
    ),
  );

  return HttpRouter.serve(CorsRouters).pipe(
    HttpServer.withLogAddress,
    Layer.provideMerge(ServerLayers),
  );
}).pipe(Layer.unwrap, Layer.launch);

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain(HttpLive);
`;

export const serverDevToolsContents = `import { Config, Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";

const DevToolsConfig = Config.all({
  enableDevTools: Config.boolean("DEVTOOLS").pipe(Config.withDefault(false)),
  devToolsUrl: Config.string("DEVTOOLS_URL").pipe(
    Config.withDefault("ws://localhost:34437"),
  ),
});

export const DevToolsLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* DevToolsConfig;

    if (!config.enableDevTools) {
      return Layer.empty;
    }

    yield* Effect.logDebug("Enabling DevTools Layer");
    return DevTools.layer(config.devToolsUrl);
  }),
);
`;
