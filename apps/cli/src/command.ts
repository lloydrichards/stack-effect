import { Command } from "effect/unstable/cli";
import { add } from "./commands/add";
import { catalog } from "./commands/catalog";
import { create } from "./commands/create";
import { graph } from "./commands/graph";
import { init } from "./commands/init";
import { plan } from "./commands/plan";
import { schema } from "./commands/schema";

export const stackEffectCommand = Command.make("stack-effect").pipe(
  Command.withDescription(
    "Interactive CLI for scaffolding and extending Effect-powered TypeScript projects. Compose targets (server, client, cli, package) with incrementally-addable modules.",
  ),
  Command.withSubcommands([init, create, add, graph, plan, schema, catalog]),
);
