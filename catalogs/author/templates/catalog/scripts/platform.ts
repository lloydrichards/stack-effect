{{#if runtime=bun}}import { BunHttpServer, BunRuntime, BunServices } from "@effect/platform-bun";{{/if}}{{#if runtime=node}}import {
  NodeHttpServer,
  NodeRuntime,
  NodeServices,
} from "@effect/platform-node";
// oxlint-disable-next-line effecttsgo/node-builtin-import -- NodeHttpServer.layer requires the Node server factory.
import { createServer } from "node:http";{{/if}}

/** File system, path, and child process services for the catalog scripts. */
export const Services = {{#if runtime=bun}}BunServices{{/if}}{{#if runtime=node}}NodeServices{{/if}}.layer;

export const runMain = {{#if runtime=bun}}BunRuntime{{/if}}{{#if runtime=node}}NodeRuntime{{/if}}.runMain;

/** An HTTP server on a free loopback port, where the CLI accepts `http:`. */
export const LoopbackServer = {{#if runtime=bun}}BunHttpServer.layer({
  hostname: "127.0.0.1",
  port: 0,
}){{/if}}{{#if runtime=node}}NodeHttpServer.layer(createServer, {
  host: "127.0.0.1",
  port: 0,
}){{/if}};
