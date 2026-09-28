{{#if runtime=bun}}import { BunHttpServer, BunRuntime } from "@effect/platform-bun";{{/if}}{{#if runtime=deno}}import { DenoHttpServer, DenoRuntime } from "@effect/platform-deno";{{/if}}{{#if runtime=node}}import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layerConfig requires the Node server factory.
import { createServer } from "node:http";{{/if}}
import { Api } from "@repo/domain/Api";
import { Config, Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { HealthGroupLive } from "./Api/Health";
import { HelloGroupLive } from "./Api/Hello";

export const ServerConfig = Config.all({
  port: Config.Number("PORT").pipe(Config.withDefault(9000)),
  hostname: Config.String("HOST").pipe(Config.withDefault("0.0.0.0")),
  idleTimeout: Config.Number("IDLE_TIMEOUT").pipe(Config.withDefault(120)),
  allowedOrigins: Config.String("ALLOWED_ORIGINS").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
});

// HTTP API Router
const ApiRouter = HttpApiBuilder.layer(Api).pipe(
  Layer.provide([HealthGroupLive, HelloGroupLive]),
);

// NOTE: Modules append additional routers through Layer.mergeAll.
const RouterDependencies = Layer.mergeAll(Layer.empty);
const AllRouters = Layer.mergeAll(ApiRouter);

// NOTE: Modules append additional server layers through Layer.mergeAll.
const ServerLayers = Layer.mergeAll({{#if runtime=bun}}BunHttpServer.layerConfig(ServerConfig){{/if}}{{#if runtime=node}}NodeHttpServer.layerConfig(createServer, ServerConfig){{/if}}{{#if runtime=deno}}DenoHttpServer.layerConfig(ServerConfig){{/if}});

const HttpLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const allowedOrigins = config.allowedOrigins.split(",").map((o) => o.trim());

  yield* Effect.logInfo(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
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
    Layer.provide(RouterDependencies),
    Layer.provideMerge(ServerLayers),
  );
}).pipe(Layer.unwrap, Layer.launch);

{{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}{{#if runtime=deno}}DenoRuntime{{/if}}.runMain(HttpLive);
