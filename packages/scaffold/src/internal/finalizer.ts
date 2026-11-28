import { CatalogReader } from "@repo/catalog/Catalog";
import {
  type Blueprint,
  type BlueprintAttachedModuleNode,
  BlueprintNode,
  type BlueprintTargetNode,
} from "@repo/domain/Blueprint";
import { FinalizeScript, type ScriptResult } from "@repo/domain/Finalize";
import { ContributionTokenContext } from "@repo/domain/Plan";
import {
  Array as Arr,
  Effect,
  type PlatformError,
  type Scope,
  Equivalence,
  Option,
  Result,
  Stream,
} from "effect";
import { ChildProcess } from "effect/process";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import type { FinalizeConfig, FinalizeExecution } from "../Finalize";
import { packagePath } from "./packageOwnership";

/**
 * The source is part of the key, so a custom script can never stand in for an
 * official one.
 *
 * @internal
 */
export const scriptKey = (script: {
  command: string;
  workdir: string;
  source?: string | undefined;
}) => `${script.source ?? ""}::${script.workdir}::${script.command}`;

const sourceField = (source: Option.Option<string>) =>
  Option.match(source, {
    onNone: () => ({}),
    onSome: (name) => ({ source: name }),
  });

// Pairs each attached module with its owning target. A validated Blueprint has
// exactly one target per module, so the pairing never needs a missing case.
const attachedModules = (blueprint: Blueprint) => {
  const targetNodes = blueprint.nodes.filter(BlueprintNode.guards.target);
  const moduleNodes = blueprint.nodes.filter(
    BlueprintNode.guards["attached-module"],
  );
  const modules = moduleNodes.flatMap((moduleNode) =>
    targetNodes
      .filter((target) => target.id === moduleNode.targetId)
      .map((targetNode) => ({ moduleNode, targetNode })),
  );
  return { targetNodes, modules };
};

const createTokenContext = (
  config: FinalizeConfig,
  target: BlueprintTargetNode,
  defaultName: string | undefined,
) =>
  new ContributionTokenContext({
    identity: target.identity,
    targetPath: packagePath(
      target.identity,
      defaultName,
      config.baseline?.packageOwners ?? [],
    ),
    config: config.config,
  });

const resolveNextSteps = (
  steps: ReadonlyArray<string> | undefined,
  context: ContributionTokenContext,
) => (steps ?? []).map((step) => context.resolve(step));

// The source is part of a script's identity, so a custom script can never
// stand in for an official one.
const SameScript = Equivalence.make<FinalizeScript>(
  (self, that) =>
    self.source === that.source &&
    self.workdir === that.workdir &&
    self.command === that.command,
);

// Finalize-phase module and target scripts run first, then config-derived
// scripts (install, lint, format), then post-finalize scripts (e.g. git init).
const orderScripts = (
  resolvedScripts: ReadonlyArray<FinalizeScript>,
  configScripts: ReadonlyArray<FinalizeScript>,
) => {
  const finalize = resolvedScripts.filter((s) => s.phase === "finalize");
  const postFinalize = resolvedScripts.filter(
    (s) => s.phase === "post-finalize",
  );
  return [...finalize, ...configScripts, ...postFinalize];
};

const buildConfigDerivedScripts = (
  config: FinalizeConfig,
): Array<FinalizeScript> => {
  const { packageManagerName: pm, lint, format } = config.config;
  const runTask = (task: string) =>
    pm === "deno" ? `deno task ${task}` : `${pm} run ${task}`;
  return [
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
  ]
    .filter((entry) => entry.when)
    .map((entry) =>
      FinalizeScript.make({
        label: entry.label,
        command: entry.command,
        workdir: ".",
        phase: "config",
        origin: "config",
      }),
    );
};

/** @internal */
export const make = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const spawner = yield* ChildProcessSpawner;

  const targetScripts = Effect.fnUntraced(function* (
    config: FinalizeConfig,
    node: BlueprintTargetNode,
  ) {
    const { scripts, defaultName } = yield* catalog.getTarget(
      node.identity.kind,
    );
    const context = createTokenContext(config, node, defaultName);
    const source = sourceField(
      catalog.getSource({ _tag: "target", kind: node.identity.kind }),
    );
    return (scripts ?? []).map((script) =>
      FinalizeScript.make({
        label: script.label,
        command: context.resolve(script.command),
        workdir: context.resolve(script.workdir ?? "{{targetPath}}"),
        phase: script.phase,
        origin: `target: ${node.identity.kind}`,
        ...source,
      }),
    );
  });

  const moduleScripts = Effect.fnUntraced(function* (
    config: FinalizeConfig,
    {
      moduleNode,
      targetNode,
    }: {
      moduleNode: BlueprintAttachedModuleNode;
      targetNode: BlueprintTargetNode;
    },
  ) {
    const { scripts } = yield* catalog.getModule(moduleNode.moduleId);
    const { defaultName } = yield* catalog.getTarget(targetNode.identity.kind);
    const context = createTokenContext(config, targetNode, defaultName);
    const source = sourceField(
      catalog.getSource({ _tag: "module", id: moduleNode.moduleId }),
    );
    return (scripts ?? []).map((script) =>
      FinalizeScript.make({
        label: script.label,
        command: context.resolve(script.command),
        workdir: context.resolve(script.workdir ?? "{{targetPath}}"),
        phase: script.phase,
        origin: `module: ${moduleNode.moduleId}`,
        ...source,
      }),
    );
  });

  const collectResolvedScripts = Effect.fnUntraced(function* (
    blueprint: Blueprint,
    config: FinalizeConfig,
  ) {
    const { targetNodes, modules } = attachedModules(blueprint);
    const fromTargets = yield* Effect.forEach(targetNodes, (node) =>
      targetScripts(config, node),
    );
    const fromModules = yield* Effect.forEach(modules, (module) =>
      moduleScripts(config, module),
    );
    return [...fromTargets.flat(), ...fromModules.flat()];
  });

  const scripts = Effect.fn("Finalizer.scripts")(function* (
    blueprint: Blueprint,
    config: FinalizeConfig,
  ) {
    const resolved = yield* collectResolvedScripts(blueprint, config);
    const configScripts = buildConfigDerivedScripts(config);
    return orderScripts(Arr.dedupeWith(resolved, SameScript), configScripts);
  });

  const executeScoped = Effect.fn("Finalizer.executeScoped")(function* (
    script: FinalizeScript,
    repositoryRoot: string,
  ): Effect.fn.Return<
    FinalizeExecution,
    PlatformError.PlatformError,
    Scope.Scope
  > {
    const workdir =
      script.workdir === "."
        ? repositoryRoot
        : `${repositoryRoot}/${script.workdir}`;
    const command = ChildProcess.make(script.command, {
      cwd: workdir,
      shell: true,
      stdout: "pipe",
      stderr: "pipe",
    });

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

    return { output, result };
  });

  const collectNextSteps = Effect.fn("Finalizer.collectNextSteps")(function* (
    blueprint: Blueprint,
    config: FinalizeConfig,
  ) {
    const { targetNodes, modules } = attachedModules(blueprint);

    const targetSteps = yield* Effect.forEach(targetNodes, (node) =>
      Effect.map(catalog.getTarget(node.identity.kind), (definition) =>
        resolveNextSteps(
          definition.nextSteps,
          createTokenContext(config, node, definition.defaultName),
        ),
      ),
    );

    const moduleSteps = yield* Effect.forEach(
      modules,
      ({ moduleNode, targetNode }) =>
        Effect.gen(function* () {
          const definition = yield* catalog.getModule(moduleNode.moduleId);
          const { defaultName } = yield* catalog.getTarget(
            targetNode.identity.kind,
          );
          return resolveNextSteps(
            definition.nextSteps,
            createTokenContext(config, targetNode, defaultName),
          );
        }),
    );

    return Arr.dedupe([...targetSteps.flat(), ...moduleSteps.flat()]);
  });

  return { scripts, executeScoped, collectNextSteps };
});
