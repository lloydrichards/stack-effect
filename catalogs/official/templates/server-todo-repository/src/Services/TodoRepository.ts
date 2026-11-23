{{#if runtime=bun}}import { layer as PlatformCryptoLayer } from "@effect/platform-bun/BunCrypto";{{/if}}{{#if runtime=node}}import { layer as PlatformCryptoLayer } from "@effect/platform-node/NodeCrypto";{{/if}}{{#if runtime=deno}}import { layer as PlatformCryptoLayer } from "@effect/platform-deno/DenoCrypto";{{/if}}
import { DatabaseLayer } from "@repo/db/Migrations";
import { TodoRepository } from "@repo/db/TodoRepository";
import { Layer } from "effect";

export const TodoRepositoryLayer = TodoRepository.layer.pipe(
  Layer.provide([DatabaseLayer, PlatformCryptoLayer]),
);
