import { CatalogService } from "@repo/catalog";
import { type Blueprint, BlueprintNode } from "@repo/domain/Blueprint";
import type { ScriptDefinition } from "@repo/domain/Catalog";
import { type ScriptResult } from "@repo/domain/Finalize";
import {
  ContributionTokenContext,
  type StackConfig,
} from "@repo/domain/Scaffold";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Option,
  Result,
  Stream,
} from "effect";
import { ChildProcess } from "effect/unstable/process";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

export type FinalizeConfig = {
  readonly config: typeof StackConfig.Type;
  readonly repoRoot: string;
};

type ResolvedScript = {
  readonly label: string;
  readonly command: string;
  readonly workdir: string;
  readonly phase: "finalize" | "post-finalize";
};

export class FinalizeService extends Context.Service<FinalizeService>()(
  "FinalizeService",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const spawner = yield* ChildProcessSpawner;

      const collectResolvedScripts = Effect.fn(
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

        // Collect finalize scripts from targets
        const targetScripts = yield* Effect.forEach(targetNodes, (node) =>
          Effect.map(catalog.getTarget(node.identity.kind), ({ scripts }) => {
            const context = new ContributionTokenContext({
              targetKey: node.id,
              identity: node.identity,
              config: config.config,
            });
            return Arr.map(scripts ?? [], (s) => ({
              label: s.label,
              command: context.resolve(s.command),
              workdir: context.resolve(s.workdir ?? "{{targetPath}}"),
              phase: (s.phase ?? "finalize") as "finalize" | "post-finalize",
            }));
          }),
        ).pipe(Effect.map(Arr.flatten));

        // Collect finalize scripts from modules (blueprint preserves dependency order)
        const moduleScripts = yield* Effect.forEach(moduleNodes, (moduleNode) =>
          Effect.gen(function* () {
            const targetNode = Arr.findFirst(
              targetNodes,
              (t) => t.id === moduleNode.targetId,
            );
            if (Option.isNone(targetNode)) return [];

            const definition = yield* catalog.getModule(moduleNode.moduleId);
            const context = new ContributionTokenContext({
              targetKey: moduleNode.targetId,
              identity: targetNode.value.identity,
              config: config.config,
            });
            return Arr.map(definition.scripts ?? [], (s) => ({
              label: s.label,
              command: context.resolve(s.command),
              workdir: context.resolve(s.workdir ?? "{{targetPath}}"),
              phase: (s.phase ?? "finalize") as "finalize" | "post-finalize",
            }));
          }),
        ).pipe(Effect.map(Arr.flatten));

        return [...targetScripts, ...moduleScripts];
      });

      const run = Effect.fn("FinalizeService.run")(function* (
        blueprint: typeof Blueprint.Type,
        config: FinalizeConfig,
      ) {
        const scripts = yield* collectResolvedScripts(blueprint, config);
        const configScripts = buildConfigDerivedScripts(config);
        const allScripts = orderScripts(scripts, configScripts);

        return allScripts.map((script) => ({
          script,
          execute: () => executeScript(spawner, script, config.repoRoot),
        }));
      });

      const preview = Effect.fn("FinalizeService.preview")(function* (
        blueprint: typeof Blueprint.Type,
        config: FinalizeConfig,
      ) {
        const scripts = yield* collectResolvedScripts(blueprint, config);
        const configScripts = buildConfigDerivedScripts(config);
        return orderScripts(scripts, configScripts).map(
          ({ label, command }) => ({
            label,
            command,
          }),
        );
      });

      return { run, preview };
    }),
  },
) {
  static readonly layer = Layer.effect(FinalizeService)(
    FinalizeService.make,
  ).pipe(Layer.provide(CatalogService.layer));
}

/**
 * Orders scripts so that finalize-phase module/target scripts run first,
 * then config-derived scripts (install, lint, format), then post-finalize
 * scripts (e.g. git init).
 */
const orderScripts = (
  resolvedScripts: ResolvedScript[],
  configScripts: ResolvedScript[],
): ResolvedScript[] => {
  const finalize = resolvedScripts.filter((s) => s.phase === "finalize");
  const postFinalize = resolvedScripts.filter(
    (s) => s.phase === "post-finalize",
  );
  return [...finalize, ...configScripts, ...postFinalize];
};

const buildConfigDerivedScripts = (
  config: FinalizeConfig,
): ResolvedScript[] => {
  const { packageManagerName: pm, lint, format } = config.config;
  return Arr.filterMap(
    [
      { when: true, label: "Install dependencies", command: `${pm} install` },
      { when: !!lint, label: `Run ${lint} lint`, command: `${pm} run lint` },
      {
        when: !!format,
        label: `Run ${format} format`,
        command: `${pm} run format`,
      },
    ],
    (entry): Result.Result<ResolvedScript, void> =>
      entry.when
        ? Result.succeed({
            label: entry.label,
            command: entry.command,
            workdir: ".",
            phase: "finalize" as const,
          })
        : Result.failVoid,
  );
};

const executeScript = (
  spawner: typeof ChildProcessSpawner.Service,
  script: ResolvedScript,
  repoRoot: string,
) => {
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
      Effect.map((code): ScriptResult => {
        if (code === 0) {
          return Result.succeed({
            label: script.label,
            command: script.command,
          });
        }
        return Result.fail({
          label: script.label,
          command: script.command,
          error: `Process exited with code ${code}`,
        });
      }),
    );

    return {
      output,
      result,
    };
  });
};
