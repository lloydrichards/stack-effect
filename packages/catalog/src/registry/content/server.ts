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
 * Server index template with composition points.
 *
 * This template defines the base server structure. Modules add their handlers
 * to the routers via composition operations targeting `Layer.provide` calls.
 *
 * Composition points for ts-append-call-arg:
 * - HttpRpcRouter: Layer.provide(...) - append RPC handler layers
 * - WebSocketRpcRouter: Layer.provide(...) - append WebSocket RPC handler layers
 *
 * HTTP API groups are added via Layer.provide([...]) array pattern.
 */
export const serverIndexContents = `import { BunHttpServer, BunRuntime } from "@effect/platform-bun";
import { Api } from "@repo/domain/Api";
import { EventRpc } from "@repo/domain/Rpc";
import { WebSocketRpc } from "@repo/domain/WebSocket";
import { ObservabilityLive } from "@repo/observability";
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

// HTTP RPC Router (for EventRpc - streaming over HTTP)
// Modules compose additional layers via ts-append-call-arg targeting "Layer.provide"
const HttpRpcRouter = RpcServer.layerHttp({
  group: EventRpc,
  path: "/rpc",
  protocol: "http",
  spanPrefix: "rpc",
}).pipe(
  Layer.provide(EventRpcLive),
  Layer.provide(RpcSerialization.layerNdjson),
);

// WebSocket RPC Router (for PresenceRpc - real-time presence)
// Modules compose additional layers via ts-append-call-arg targeting "Layer.provide"
const WebSocketRpcRouter = RpcServer.layerHttp({
  group: WebSocketRpc,
  path: "/ws",
  protocol: "websocket",
  spanPrefix: "ws",
  disableFatalDefects: true,
}).pipe(
  Layer.provide(PresenceRpcLive),
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
  yield* Effect.logDebug("Enabling DevTools Layer");
  return DevTools.layer();
}).pipe(Layer.unwrap);

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const allowedOrigins = config.allowedOrigins.split(",").map((o) => o.trim());

  yield* Effect.logInfo("CORS allowed origins: " + allowedOrigins.join(", "));
  yield* Effect.logInfo("Starting server with:");
  yield* Effect.logInfo("  - HTTP API at /");
  yield* Effect.logInfo("  - HTTP RPC at /rpc (EventRpc)");
  yield* Effect.logInfo("  - WebSocket RPC at /ws (PresenceRpc)");

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
