{{#if runtime=bun}}import { layer as PlatformCryptoLayer } from "@effect/platform-bun/BunCrypto";{{/if}}{{#if runtime=node}}import { layer as PlatformCryptoLayer } from "@effect/platform-node/NodeCrypto";{{/if}}{{#if runtime=deno}}import { layer as PlatformCryptoLayer } from "@effect/platform-deno/DenoCrypto";{{/if}}
import { DatabaseLive, TodoRepository } from "@repo/db";
import { Layer } from "effect";

export const TodoRepositoryLayer = TodoRepository.layer.pipe(
  Layer.provide([DatabaseLive, PlatformCryptoLayer]),
);
