import { CatalogService } from "@repo/catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import type {
  ScriptDefinition,
  TargetIdentity,
  TargetKey,
} from "@repo/domain/Catalog";
import { FinalizeReport } from "@repo/domain/Finalize";
import {
  type ContributionTokenContext,
  type StackConfig,
} from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  PlatformError,
  Scope,
  Stream,
} from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";
import { resolveTokenString } from "../plan/ContributionResolver";

export type ScriptExecution = {
  readonly label: string;
  readonly command: string;
  readonly workdir: string;
  readonly output: Stream.Stream<string, PlatformError.PlatformError>;
  readonly result: Effect.Effect<
    {
      readonly label: string;
      readonly command: string;
      readonly workdir: string;
      readonly status: "success" | "failure";
      readonly error?: string;
    },
    PlatformError.PlatformError,
    never
  >;
};

export type FinalizeConfig = {
  readonly config: typeof StackConfig.Type;
  readonly repoRoot: string;
};

type ResolvedScript = {
  readonly label: string;
  readonly command: string;
  readonly workdir: string;
};

export class FinalizeService extends Context.Service<FinalizeService>()(
  "FinalizeService",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const spawner = yield* ChildProcessSpawner;

      const collectFinalizeScripts = Effect.fn(
        "FinalizeService.collectScripts",
      )(function* (blueprint: typeof Blueprint.Type, config: FinalizeConfig) {
        const moduleNodes = Arr.filter(
          blueprint.nodes,
          BlueprintNode.guards["attached-module"],
        );
        const targetNodes = Arr.filter(
          blueprint.nodes,
          BlueprintNode.guards.target,
        );

        const sorted = topologicalSort(
          moduleNodes.map((n) => n.id),
          blueprint.edges
            .filter((e) => e.reason === "required-module")
            .map((e) => ({ from: e.from, to: e.to })),
        );

        // Collect finalize scripts from targets
        const targetScripts: ResolvedScript[] = [];
        for (const node of targetNodes) {
          const definition = yield* catalog.getTarget(node.identity.kind);
          const scripts = definition.scripts ?? [];
          const context = makeTokenContext(node.id, node.identity, config);
          for (const script of scripts) {
            if (script.phase === "finalize") {
              targetScripts.push(resolveScript(script, context));
            }
          }
        }

        // Collect finalize scripts from modules in dependency order
        const moduleScripts: ResolvedScript[] = [];
        for (const nodeId of sorted) {
          const moduleNode = moduleNodes.find((n) => n.id === nodeId);
          if (!moduleNode) continue;

          const definition = yield* catalog.getModule(moduleNode.moduleId);
          const scripts = definition.scripts ?? [];
          const targetNode = targetNodes.find(
            (t) => t.id === moduleNode.targetId,
          );
          if (!targetNode) continue;

          const context = makeTokenContext(
            moduleNode.targetId,
            targetNode.identity,
            config,
          );
          for (const script of scripts) {
            if (script.phase === "finalize") {
              moduleScripts.push(resolveScript(script, context));
            }
          }
        }

        return [...targetScripts, ...moduleScripts];
      });

      const run = Effect.fn("FinalizeService.run")(function* (
        blueprint: typeof Blueprint.Type,
        config: FinalizeConfig,
      ) {
        const scripts = yield* collectFinalizeScripts(blueprint, config);
        const configScripts = buildConfigDerivedScripts(config);
        const allScripts = [...scripts, ...configScripts];

        return allScripts.map((script) => ({
          script,
          execute: () => executeScript(spawner, script, config.repoRoot),
        }));
      });

      const preview = Effect.fn("FinalizeService.preview")(function* (
        blueprint: typeof Blueprint.Type,
        config: FinalizeConfig,
      ) {
        const scripts = yield* collectFinalizeScripts(blueprint, config);
        const configScripts = buildConfigDerivedScripts(config);
        return [...scripts, ...configScripts];
      });

      return { run, preview };
    }),
  },
) {
  static readonly layer = Layer.effect(FinalizeService)(
    FinalizeService.make,
  ).pipe(Layer.provide(CatalogService.layer));
}

const makeTokenContext = (
  targetKey: typeof TargetKey.Type,
  identity: typeof TargetIdentity.Type,
  config: FinalizeConfig,
): typeof ContributionTokenContext.Type => ({
  targetKey,
  targetPath: identity.toPath(),
  targetKind: identity.kind,
  targetName: identity.name,
  packageName: identity.toPackageName(),
  runtime: config.config.runtimeName,
  packageManager: config.config.packageManagerName,
  packageManagerSpec: config.config.packageManagerSpec,
  projectName: config.config.name,
});

const resolveScript = (
  script: typeof ScriptDefinition.Type,
  context: typeof ContributionTokenContext.Type,
): ResolvedScript => ({
  label: script.label,
  command: resolveTokenString(script.command, context),
  workdir: resolveTokenString(script.workdir ?? "{{targetPath}}", context),
});

const buildConfigDerivedScripts = (
  config: FinalizeConfig,
): ResolvedScript[] => {
  const { config: stackConfig } = config;
  const pm = stackConfig.packageManagerName;
  const scripts: ResolvedScript[] = [
    {
      label: "Install dependencies",
      command: `${pm} install`,
      workdir: ".",
    },
  ];
  if (stackConfig.lint) {
    scripts.push({
      label: `Run ${stackConfig.lint} lint`,
      command: `${pm} run lint`,
      workdir: ".",
    });
  }
  if (stackConfig.format) {
    scripts.push({
      label: `Run ${stackConfig.format} format`,
      command: `${pm} run format`,
      workdir: ".",
    });
  }
  return scripts;
};

const executeScript = (
  spawner: typeof ChildProcessSpawner.Service,
  script: ResolvedScript,
  repoRoot: string,
): Effect.Effect<ScriptExecution, PlatformError.PlatformError, Scope.Scope> => {
  const workdir =
    script.workdir === "." ? repoRoot : `${repoRoot}/${script.workdir}`;

  const command = ChildProcess.make({
    cwd: workdir,
    shell: true,
    stdout: "pipe",
    stderr: "pipe",
  })`${script.command}`;

  return Effect.gen(function* () {
    const handle = yield* spawner.spawn(command);

    const output = Stream.merge(handle.stdout, handle.stderr).pipe(
      Stream.decodeText(),
      Stream.splitLines,
    );

    const result = handle.exitCode.pipe(
      Effect.map((code) => {
        if (code === 0) {
          return {
            label: script.label,
            command: script.command,
            workdir: script.workdir,
            status: "success" as const,
          };
        }
        return {
          label: script.label,
          command: script.command,
          workdir: script.workdir,
          status: "failure" as const,
          error: `Process exited with code ${code}`,
        };
      }),
    );

    return {
      label: script.label,
      command: script.command,
      workdir: script.workdir,
      output,
      result,
    } satisfies ScriptExecution;
  });
};

const topologicalSort = (
  nodeIds: readonly string[],
  edges: readonly { from: string; to: string }[],
): string[] => {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  for (const edge of edges) {
    if (inDegree.has(edge.from) && inDegree.has(edge.to)) {
      adjacency.get(edge.to)!.push(edge.from);
      inDegree.set(edge.from, (inDegree.get(edge.from) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  for (const id of nodeIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }

  return sorted;
};
