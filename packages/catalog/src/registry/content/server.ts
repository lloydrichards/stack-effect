export const serverPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.64",
    "effect": "4.0.0-beta.64"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@repo/config-typescript": "workspace:*",
    "@types/bun": "^1.2.17",
    "typescript": "6.0.2",
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
    "types": ["@types/bun"]
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
 * - DevTools support (optional)
 *
 * Additional capabilities (RPC, WebSocket) are added by modules.
 */
export const serverIndexContents = `import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Api } from "@repo/domain/Api";
import { Config, Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HealthGroupLive } from "./Api/Health";
import { HelloGroupLive } from "./Api/Hello";

// ============================================================================
// Server Configuration
// ============================================================================

const ServerConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(9000)),
  hostname: Config.string("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.number("IDLE_TIMEOUT").pipe(Config.withDefault(120)),
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

// All Routers - modules append additional routers here via Layer.mergeAll
const AllRouters = Layer.mergeAll(ApiRouter);

// ============================================================================
// Server Launch
// ============================================================================

const DevToolsLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (!config.enableDevTools) {
    return Layer.empty;
  }
  yield* Effect.logDebug("Enabling DevTools Layer");
  return DevTools.layer();
}).pipe(Layer.unwrap);

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const allowedOrigins = config.allowedOrigins.split(",").map((o) => o.trim());

  yield* Effect.logInfo("CORS allowed origins: " + allowedOrigins.join(", "));
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
    Layer.provideMerge(DevToolsLive),
    Layer.provideMerge(BunHttpServer.layerConfig(ServerConfig)),
  );
}).pipe(Layer.unwrap, Layer.launch);

BunRuntime.runMain(HttpLive);
`;
