{{#if runtime=bun}}import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layer requires the Node server factory.
import { createServer } from "node:http";{{/if}}
import { Console } from "effect";

/** File system, path, and child process services for the catalog scripts. */
export const Services = {{#if runtime=bun}}BunServices{{/if}}{{#if runtime=node}}NodeServices{{/if}}.layer;

const causes = (error: Error): Array<string> =>
  error.cause instanceof Error
    ? [error.cause.message, ...causes(error.cause)]
    : [];

/** Print an error with each cause under it, such as the HTTP status behind a failed fetch. */
export const reportError = (error: Error) =>
  Console.error(
    [
      error.message,
      ...causes(error).map((message) => `  Caused by: ${message}`),
    ].join("\n"),
  );

export const runMain = {{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain;

/** An HTTP server on a free loopback port, where the CLI accepts `http:`. */
export const LoopbackServer = {{#if runtime=bun}}BunHttpServer.layer({
  hostname: "127.0.0.1",
  port: 0,
}){{/if}}{{#if runtime=node}}NodeHttpServer.layer(createServer, {
  host: "127.0.0.1",
  port: 0,
}){{/if}};
