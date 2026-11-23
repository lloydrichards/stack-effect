import { CatalogService } from "@repo/catalog";
import {
  type Blueprint,
  BlueprintNode,
  type BlueprintTargetNode,
} from "@repo/domain/Blueprint";
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
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";

export type FinalizeConfig = {
  readonly config: StackConfig;
  readonly repoRoot: string;
};

export type FinalizeScript = {
  readonly label: string;
  readonly command: string;
  readonly workdir: string;
  readonly phase: "finalize" | "config" | "post-finalize";
  readonly origin: string;
  /** Selected catalog source that contributed the script, when sources are named. */
  readonly source?: string;
};

/**
 * Identifies one script for deduplication and selection. The source is part of
 * the key, so a custom script can never stand in for an official one.
 */
export const scriptKey = (script: {
  readonly command: string;
  readonly workdir: string;
  readonly source?: string | undefined;
}) => `${script.source ?? ""}::${script.workdir}::${script.command}`;

const sourceField = (source: Option.Option<string>) =>
  Option.match(source, {
    onNone: () => ({}),
    onSome: (name) => ({ source: name }),
  });

/**
 * Pairs each attached module with its owning target. A validated Blueprint has
 * exactly one target per module, so the pairing never needs a missing case.
 */
const attachedModules = (blueprint: Blueprint) => {
  const targetNodes = Arr.filter(blueprint.nodes, BlueprintNode.guards.target);
  const moduleNodes = Arr.filter(
    blueprint.nodes,
    BlueprintNode.guards["attached-module"],
  );
  const modules = Arr.flatMap(moduleNodes, (moduleNode) =>
    Arr.filter(targetNodes, (target) => target.id === moduleNode.targetId).map(
      (targetNode) => ({ moduleNode, targetNode }),
    ),
  );
  return { targetNodes, modules };
};

export class FinalizeService extends Context.Service<FinalizeService>()(
  "FinalizeService",
  {
    make: Effect.gen(function* () {
      const catalog = yield* CatalogService;
      const spawner = yield* ChildProcessSpawner;

      const collectResolvedScripts = Effect.fn(
        "FinalizeService.collectScripts",
      )(function* (blueprint: Blueprint, config: FinalizeConfig) {
        const { targetNodes, modules } = attachedModules(blueprint);

        const targetScripts = yield* Effect.forEach(targetNodes, (node) =>
          Effect.map(catalog.getTarget(node.identity.kind), ({ scripts }) => {
            const context = createTokenContext(config, node);
            return Arr.map(scripts ?? [], (s) => ({
              label: s.label,
              command: context.resolve(s.command),
              workdir: context.resolve(s.workdir ?? "{{targetPath}}"),
              phase: (s.phase ?? "finalize") as "finalize" | "post-finalize",
              origin: `target: ${node.identity.kind}`,
              ...sourceField(
                catalog.getSource({ _tag: "target", kind: node.identity.kind }),
              ),
            }));
          }),
        ).pipe(Effect.map(Arr.flatten));

        const moduleScripts = yield* Effect.forEach(
          modules,
          ({ moduleNode, targetNode }) =>
            Effect.map(catalog.getModule(moduleNode.moduleId), (definition) => {
              const context = createTokenContext(config, targetNode);
              return Arr.map(definition.scripts ?? [], (s) => ({
                label: s.label,
                command: context.resolve(s.command),
                workdir: context.resolve(s.workdir ?? "{{targetPath}}"),
                phase: (s.phase ?? "finalize") as "finalize" | "post-finalize",
                origin: `module: ${moduleNode.moduleId}`,
                ...sourceField(
                  catalog.getSource({
                    _tag: "module",
                    id: moduleNode.moduleId,
                  }),
                ),
              }));
            }),
        ).pipe(Effect.map(Arr.flatten));

        return [...targetScripts, ...moduleScripts];
      });

      const deduplicateScripts = (
        scripts: ReadonlyArray<FinalizeScript>,
      ): FinalizeScript[] => {
        const seen = new Set<string>();
        return scripts.filter((s) => {
          const key = scriptKey(s);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      };

      const scripts = Effect.fn("FinalizeService.scripts")(function* (
        blueprint: Blueprint,
        config: FinalizeConfig,
      ) {
        const resolved = yield* collectResolvedScripts(blueprint, config);
        const configScripts = buildConfigDerivedScripts(config);
        return orderScripts(deduplicateScripts(resolved), configScripts);
      });

      // The caller owns the Scope so it can drain output before the process is released.
      const executeScoped = (script: FinalizeScript, repoRoot: string) =>
        executeScript(spawner, script, repoRoot);

      const collectNextSteps = Effect.fn("FinalizeService.collectNextSteps")(
        function* (blueprint: Blueprint, config: FinalizeConfig) {
          const { targetNodes, modules } = attachedModules(blueprint);

          const targetSteps = yield* Effect.forEach(targetNodes, (node) =>
            Effect.map(catalog.getTarget(node.identity.kind), (definition) =>
              resolveNextSteps(
                definition.nextSteps,
                createTokenContext(config, node),
              ),
            ),
          ).pipe(Effect.map(Arr.flatten));

          const moduleSteps = yield* Effect.forEach(
            modules,
            ({ moduleNode, targetNode }) =>
              Effect.map(catalog.getModule(moduleNode.moduleId), (definition) =>
                resolveNextSteps(
                  definition.nextSteps,
                  createTokenContext(config, targetNode),
                ),
              ),
          ).pipe(Effect.map(Arr.flatten));

          // NOTE: Exact next-step text is the stable identity; preserve the first occurrence.
          return [...new Set([...targetSteps, ...moduleSteps])];
        },
      );

      return { scripts, executeScoped, collectNextSteps };
    }),
  },
) {
  static readonly layer = Layer.effect(FinalizeService)(FinalizeService.make);
}

const createTokenContext = (
  config: FinalizeConfig,
  target: BlueprintTargetNode,
) =>
  new ContributionTokenContext({
    targetKey: target.id,
    identity: target.identity,
    config: config.config,
  });

const resolveNextSteps = (
  steps: ReadonlyArray<string> | undefined,
  context: ContributionTokenContext,
) => Arr.map(steps ?? [], (step) => context.resolve(step));

/**
 * Orders scripts so that finalize-phase module/target scripts run first,
 * then config-derived scripts (install, lint, format), then post-finalize
 * scripts (e.g. git init).
 */
const orderScripts = (
  resolvedScripts: FinalizeScript[],
  configScripts: FinalizeScript[],
) => {
  const finalize = resolvedScripts.filter((s) => s.phase === "finalize");
  const postFinalize = resolvedScripts.filter(
    (s) => s.phase === "post-finalize",
  );
  return [...finalize, ...configScripts, ...postFinalize];
};

const buildConfigDerivedScripts = (
  config: FinalizeConfig,
): FinalizeScript[] => {
  const { packageManagerName: pm, lint, format } = config.config;
  const runTask = (task: string) =>
    pm === "deno" ? `deno task ${task}` : `${pm} run ${task}`;
  return Arr.filterMap(
    [
      { when: true, label: "Install dependencies", command: `${pm} install` },
      {
        when: pm === "deno",
        label: "Prepare dependencies",
        command: "deno task --if-present prepare",
      },
      { when: !!lint, label: `Run ${lint} lint`, command: runTask("lint") },
      {
        when: !!format,
        label: `Run ${format} format`,
        command: runTask("format"),
      },
    ],
    (entry): Result.Result<FinalizeScript, void> =>
      entry.when
        ? Result.succeed({
            label: entry.label,
            command: entry.command,
            workdir: ".",
            phase: "config" as const,
            origin: "config",
          })
        : Result.failVoid,
  );
};

const executeScript = (
  spawner: typeof ChildProcessSpawner.Service,
  script: FinalizeScript,
  repoRoot: string,
) => {
  const workdir =
    script.workdir === "." ? repoRoot : `${repoRoot}/${script.workdir}`;

  const command = ChildProcess.make(script.command, {
    cwd: workdir,
    shell: true,
    stdout: "pipe",
    stderr: "pipe",
  });

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
