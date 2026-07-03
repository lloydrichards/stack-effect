import { CatalogService } from "@repo/catalog";
import {
  ModuleCategory,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import type { Selection } from "@repo/domain/Selection";
import {
  Array as Arr,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  pipe,
  Schema,
  Stream,
} from "effect";
import { Stdio } from "effect/Stdio";
import { buildSelectionFrom } from "../lib/routing";
import { duplicatedValues, splitCommaSeparated } from "../lib/utils";
import { toWorkspaceModuleId } from "../lib/workspace";

export const CreateInput = Schema.Struct({
  name: Schema.NonEmptyString,
  targets: Schema.Array(Schema.NonEmptyString),
  runtime: Schema.optional(Schema.Literals(["bun", "node"])),
  packageManager: Schema.optional(Schema.Literals(["bun", "pnpm", "npm"])),
  monorepo: Schema.optional(Schema.String),
  lint: Schema.optional(Schema.String),
  format: Schema.optional(Schema.String),
  test: Schema.optional(Schema.String),
  git: Schema.optional(Schema.Boolean),
});

export type CreateInput = typeof CreateInput.Type;

export type CreateFlagsInput = {
  readonly name: Option.Option<string>;
  readonly from: Option.Option<string>;
  readonly targets: Option.Option<ReadonlyArray<string>>;
  readonly root: Option.Option<string>;
  readonly runtime: Option.Option<"bun" | "node">;
  readonly packageManager: Option.Option<"bun" | "pnpm" | "npm">;
  readonly monorepo: Option.Option<string>;
  readonly lint: Option.Option<string>;
  readonly format: Option.Option<string>;
  readonly test: Option.Option<string>;
  readonly noGit: boolean;
};

export type NormalizedCreateRequest = {
  readonly input: CreateInput;
  readonly repoRoot: string;
  readonly config: typeof StackConfig.Type;
  readonly selection: typeof Selection.Type;
  readonly command: string;
  readonly explicitOverrides: {
    readonly runtime: boolean;
    readonly packageManager: boolean;
    readonly monorepo: boolean;
    readonly lint: boolean;
    readonly format: boolean;
    readonly test: boolean;
    readonly git: boolean;
  };
};

type CollectedCreateTarget = {
  kind: typeof TargetKind.Type;
  name: string;
  modules: Array<typeof ModuleId.Type>;
};

const DEFAULTS = {
  runtime: "bun",
  packageManager: "bun",
  monorepo: "turbo",
  lint: "biome",
  format: "biome",
  test: "vitest",
  git: true,
} as const;

const optionToUndefined = <A>(option: Option.Option<A>) =>
  Option.match(option, {
    onNone: () => undefined,
    onSome: (value) => value,
  });

const quoteShellArg = (value: string) =>
  /^[A-Za-z0-9_./:,@+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;

const dedupeModules = (modules: ReadonlyArray<typeof ModuleId.Type>) =>
  Arr.map(Arr.dedupe(Arr.map(modules, String)), (moduleId) =>
    ModuleId.make(moduleId),
  );

const targetKey = <A extends Pick<CollectedCreateTarget, "kind" | "name">>(
  target: A,
) => `${target.kind}/${target.name}`;

const findTarget = (
  targets: ReadonlyArray<CollectedCreateTarget>,
  identity: TargetIdentity,
) =>
  Arr.findFirst(
    targets,
    (target) => target.kind === identity.kind && target.name === identity.name,
  );

const mergeCollectedTargets = (
  targets: ReadonlyArray<CollectedCreateTarget>,
): ReadonlyArray<CollectedCreateTarget> => {
  const merged = new Map<string, CollectedCreateTarget>();

  for (const target of targets) {
    const key = targetKey(target);
    const existing = merged.get(key);
    merged.set(key, {
      kind: target.kind,
      name: target.name,
      modules: dedupeModules([...(existing?.modules ?? []), ...target.modules]),
    });
  }

  return Arr.fromIterable(merged.values());
};

const ensureTargetModule = (
  targets: Array<CollectedCreateTarget>,
  identity: TargetIdentity,
  moduleId: typeof ModuleId.Type,
) => {
  const existing = findTarget(targets, identity);
  return Option.match(existing, {
    onNone: () => {
      targets.push({
        kind: identity.kind,
        name: identity.name,
        modules: [moduleId],
      });
      return true;
    },
    onSome: (target) => {
      if (Arr.contains(target.modules, moduleId)) return false;
      target.modules.push(moduleId);
      return true;
    },
  });
};

export class CreateRequestService extends Context.Service<CreateRequestService>()(
  "CreateRequestService",
  {
    make: Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const catalog = yield* CatalogService;

      const resolveNameAndRoot = Effect.fn("CreateRequest.resolveNameAndRoot")(
        function* (nameInput: string, rootFlag: Option.Option<string>) {
          const base = Option.getOrElse(rootFlag, () => process.cwd());
          if (nameInput === ".") {
            const resolved = path.resolve(base);
            return { projectName: path.basename(resolved), repoRoot: resolved };
          }
          const repoRoot = path.resolve(base, nameInput);
          return { projectName: nameInput, repoRoot };
        },
      );

      const readInput = Effect.fn("CreateRequest.readInput")(function* (
        flags: CreateFlagsInput,
      ) {
        const hasFrom = Option.isSome(flags.from);
        const fromOverrides = [
          Option.isSome(flags.name) ? "project name" : undefined,
          Option.isSome(flags.targets) ? "--target" : undefined,
          Option.isSome(flags.runtime) ? "--runtime" : undefined,
          Option.isSome(flags.packageManager) ? "--package-manager" : undefined,
          Option.isSome(flags.monorepo) ? "--monorepo" : undefined,
          Option.isSome(flags.lint) ? "--lint" : undefined,
          Option.isSome(flags.format) ? "--format" : undefined,
          Option.isSome(flags.test) ? "--test" : undefined,
          flags.noGit ? "--no-git" : undefined,
        ].filter((override) => override !== undefined);

        if (hasFrom && Arr.isArrayNonEmpty(fromOverrides)) {
          return yield* Effect.fail(
            `Use either --from or direct create flags. When using --from, put these values in the JSON input instead: ${Arr.join(fromOverrides, ", ")}.`,
          );
        }

        if (hasFrom) {
          const source = flags.from.value;
          const raw =
            source === "-"
              ? yield* (yield* Stdio).stdin.pipe(
                  Stream.decodeText(),
                  Stream.mkString,
                )
              : yield* fs.readFileString(source);
          return yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(CreateInput),
          )(raw);
        }

        if (Option.isNone(flags.name)) {
          return yield* Effect.fail(
            "Project name is required. Use a name such as 'chat-app', or '.' for the resolved --root directory.",
          );
        }

        if (Option.isNone(flags.targets)) {
          return yield* Effect.fail(
            "At least one --target is required for non-interactive create.",
          );
        }

        return {
          name: flags.name.value as typeof Schema.NonEmptyString.Type,
          targets: [...flags.targets.value] as Array<
            typeof Schema.NonEmptyString.Type
          >,
          runtime: optionToUndefined(flags.runtime),
          packageManager: optionToUndefined(flags.packageManager),
          monorepo: optionToUndefined(flags.monorepo),
          lint: optionToUndefined(flags.lint),
          format: optionToUndefined(flags.format),
          test: optionToUndefined(flags.test),
          git: flags.noGit ? false : undefined,
        } satisfies CreateInput;
      });

      const defaultTargetName = Effect.fn("CreateRequest.defaultTargetName")(
        function* (kind: typeof TargetKind.Type) {
          const target = yield* catalog
            .getTarget(kind)
            .pipe(
              Effect.mapError(
                () => `Unknown target kind "${kind}" in create request.`,
              ),
            );
          return target.defaultName;
        },
      );

      const resolveTargetName = Effect.fn("CreateRequest.resolveTargetName")(
        function* (kind: typeof TargetKind.Type, rawName: string) {
          const trimmed = rawName.trim();
          if (trimmed.length > 0) return trimmed;
          const fallback = yield* defaultTargetName(kind);
          if (fallback) return fallback;
          return yield* Effect.fail(
            `Target kind "${kind}" does not define a default name. Provide an explicit target name.`,
          );
        },
      );

      const parseTargetSpecs = Effect.fn("CreateRequest.parseTargetSpecs")(
        function* (specs: ReadonlyArray<string>) {
          const targets = yield* Effect.forEach(specs, (rawSpec) =>
            Effect.gen(function* () {
              const spec = rawSpec.trim();
              const colonIndex = spec.indexOf(":");
              if (colonIndex <= 0 || colonIndex === spec.length - 1) {
                return yield* Effect.fail(
                  `Invalid --target value "${rawSpec}". Expected <targetKind>/<targetName>:<moduleId>[,<moduleId>...].`,
                );
              }

              const identityText = spec.slice(0, colonIndex).trim();
              const moduleText = spec.slice(colonIndex + 1).trim();
              const slashIndex = identityText.indexOf("/");
              if (slashIndex <= 0) {
                return yield* Effect.fail(
                  `Invalid target identity "${identityText}". Expected <targetKind>/<targetName>.`,
                );
              }

              const kind = TargetKind.make(
                identityText.slice(0, slashIndex).trim(),
              );
              if (kind === "workspace") {
                return yield* Effect.fail(
                  'The create command cannot target kind "workspace"; workspace setup is implied by project creation.',
                );
              }

              yield* catalog
                .getTarget(kind)
                .pipe(
                  Effect.mapError(
                    () =>
                      `Unknown target kind "${kind}" in target spec "${rawSpec}".`,
                  ),
                );

              const name = yield* resolveTargetName(
                kind,
                identityText.slice(slashIndex + 1),
              );
              const modules = splitCommaSeparated([moduleText]);

              if (Arr.isArrayEmpty(modules)) {
                return yield* Effect.fail(
                  `Target spec "${rawSpec}" must include at least one module ID.`,
                );
              }

              const duplicateModules = duplicatedValues(modules);
              if (Arr.isArrayNonEmpty(duplicateModules)) {
                return yield* Effect.fail(
                  `Duplicate module IDs in target spec "${rawSpec}": ${Arr.join(duplicateModules, ", ")}`,
                );
              }

              const identity = new TargetIdentity({ kind, name });
              const moduleIds = yield* Effect.forEach(modules, (moduleId) =>
                Effect.gen(function* () {
                  const id = ModuleId.make(moduleId);
                  yield* catalog
                    .getModule(id)
                    .pipe(
                      Effect.mapError(
                        () =>
                          `Unknown module ID "${moduleId}" in target spec "${rawSpec}".`,
                      ),
                    );
                  const supported = yield* catalog.isSupportedOn(id, identity);
                  if (!supported) {
                    return yield* Effect.fail(
                      `Module "${moduleId}" is not supported on target ${kind}/${name}.`,
                    );
                  }
                  return id;
                }),
              );

              return { kind, name, modules: moduleIds };
            }),
          );

          return mergeCollectedTargets(targets);
        },
      );

      const resolveImplicationTarget = Effect.fn(
        "CreateRequest.resolveImplicationTarget",
      )(function* (
        targets: ReadonlyArray<CollectedCreateTarget>,
        kind: typeof TargetKind.Type,
      ) {
        const candidates = Arr.filter(
          targets,
          (target) => target.kind === kind,
        );
        const fallback = yield* defaultTargetName(kind);

        if (Arr.isArrayEmpty(candidates)) {
          if (fallback) return new TargetIdentity({ kind, name: fallback });
          return yield* Effect.fail(
            `An implied module needs a "${kind}" target, but that target kind does not define a default name.`,
          );
        }

        const defaultCandidate = fallback
          ? Arr.findFirst(candidates, (target) => target.name === fallback)
          : Option.none<CollectedCreateTarget>();

        if (Option.isSome(defaultCandidate)) {
          return new TargetIdentity({
            kind: defaultCandidate.value.kind,
            name: defaultCandidate.value.name,
          });
        }

        if (candidates.length === 1) {
          return yield* pipe(
            candidates,
            Arr.head,
            Option.match({
              onNone: () =>
                Effect.fail(
                  `An implied module needs a "${kind}" target, but no candidates are available.`,
                ),
              onSome: (candidate) =>
                Effect.succeed(
                  new TargetIdentity({
                    kind: candidate.kind,
                    name: candidate.name,
                  }),
                ),
            }),
          );
        }

        return yield* Effect.fail(
          `An implied module needs a "${kind}" target, but multiple candidates exist: ${Arr.join(
            Arr.map(candidates, targetKey),
            ", ",
          )}. Add the implied module explicitly to the intended target.`,
        );
      });

      const resolveImplications = Effect.fn(
        "CreateRequest.resolveImplications",
      )(function* (targets: Array<CollectedCreateTarget>) {
        let changed = true;
        while (changed) {
          changed = false;
          yield* Effect.forEach([...targets], (target) =>
            Effect.forEach([...target.modules], (moduleId) =>
              Effect.gen(function* () {
                const definition = yield* catalog.getModule(moduleId);
                yield* Effect.forEach(definition.implies ?? [], (implication) =>
                  Effect.gen(function* () {
                    const identity = yield* resolveImplicationTarget(
                      targets,
                      implication.targetKind,
                    );
                    changed =
                      ensureTargetModule(
                        targets,
                        identity,
                        implication.moduleId,
                      ) || changed;
                  }),
                );
              }),
            ),
          );
        }
        return targets;
      });

      const resolveCapabilities = Effect.fn(
        "CreateRequest.resolveCapabilities",
      )(function* (targets: Array<CollectedCreateTarget>) {
        let changed = false;
        yield* Effect.forEach([...targets], (target) =>
          Effect.forEach([...target.modules], (moduleId) =>
            Effect.gen(function* () {
              const definition = yield* catalog.getModule(moduleId);
              yield* Effect.forEach(definition.dependencies, (dependency) =>
                Effect.gen(function* () {
                  if (dependency._tag !== "required-capability") return;

                  const existing = findTarget(targets, dependency.target);
                  const satisfied = yield* Option.match(existing, {
                    onNone: () => Effect.succeed(false),
                    onSome: (selectedTarget) =>
                      Effect.gen(function* () {
                        const providers = yield* Effect.filter(
                          selectedTarget.modules,
                          (selectedModuleId) =>
                            Effect.gen(function* () {
                              const selectedModule =
                                yield* catalog.getModule(selectedModuleId);
                              return Arr.contains(
                                selectedModule.provides ?? [],
                                dependency.capability,
                              );
                            }),
                        );
                        return Arr.isArrayNonEmpty(providers);
                      }),
                  });

                  if (satisfied) return;

                  const providers = catalog.getCapabilityProviders({
                    capability: dependency.capability,
                    target: dependency.target,
                  });

                  if (providers.length === 0) {
                    return yield* Effect.fail(
                      `Module "${definition.id}" requires capability "${dependency.capability}" on ${dependency.target.toKey()}, but no compatible provider module exists.`,
                    );
                  }

                  if (providers.length > 1) {
                    return yield* Effect.fail(
                      `Module "${definition.id}" requires capability "${dependency.capability}" on ${dependency.target.toKey()}, but multiple providers are available: ${Arr.join(
                        Arr.map(providers, (provider) => provider.id),
                        ", ",
                      )}. Add the intended provider explicitly.`,
                    );
                  }

                  const provider = yield* pipe(
                    providers,
                    Arr.head,
                    Option.match({
                      onNone: () =>
                        Effect.fail(
                          `Module "${definition.id}" requires capability "${dependency.capability}" on ${dependency.target.toKey()}, but no compatible provider module exists.`,
                        ),
                      onSome: Effect.succeed,
                    }),
                  );
                  changed =
                    ensureTargetModule(
                      targets,
                      dependency.target,
                      provider.id,
                    ) || changed;
                }),
              );
            }),
          ),
        );
        return changed;
      });

      const resolveDependencies = Effect.fn(
        "CreateRequest.resolveDependencies",
      )(function* (targets: Array<CollectedCreateTarget>) {
        let changed = true;
        while (changed) {
          yield* resolveImplications(targets);
          changed = yield* resolveCapabilities(targets);
        }
        return targets;
      });

      const buildDefaultConfig = (
        projectName: string,
        input: CreateInput,
      ): typeof StackConfig.Type => {
        const packageManager = input.packageManager ?? DEFAULTS.packageManager;
        const runtimeName =
          input.runtime ??
          (packageManager === "bun" ? ("bun" as const) : ("node" as const));
        const runtime =
          runtimeName === "bun"
            ? ({ _tag: "bun" } as const)
            : ({
                _tag: "node",
                packageManager:
                  packageManager === "bun" ? "pnpm" : packageManager,
              } as const);

        return new StackConfig({
          name: projectName as typeof Schema.NonEmptyString.Type,
          runtime,
          monorepo: input.monorepo ?? DEFAULTS.monorepo,
          lint: input.lint ?? DEFAULTS.lint,
          format: input.format ?? DEFAULTS.format,
          test: input.test ?? DEFAULTS.test,
        });
      };

      const validateRuntimeOverrides = Effect.fn(
        "CreateRequest.validateRuntimeOverrides",
      )(function* (input: CreateInput) {
        if (
          input.runtime === "bun" &&
          input.packageManager &&
          input.packageManager !== "bun"
        ) {
          return yield* Effect.fail(
            `Invalid create options: --runtime bun conflicts with --package-manager ${input.packageManager}.`,
          );
        }
        if (input.runtime === "node" && input.packageManager === "bun") {
          return yield* Effect.fail(
            "Invalid create options: --runtime node conflicts with --package-manager bun.",
          );
        }
      });

      const buildWorkspaceModules = Effect.fn(
        "CreateRequest.buildWorkspaceModules",
      )(function* (input: CreateInput) {
        const devenvModules = catalog
          .getModules({ category: ModuleCategory.make("devenv") })
          .map((module) => module.id);
        return dedupeModules([
          ModuleId.make(
            toWorkspaceModuleId(input.monorepo ?? DEFAULTS.monorepo),
          ),
          ModuleId.make(toWorkspaceModuleId(input.lint ?? DEFAULTS.lint)),
          ModuleId.make(toWorkspaceModuleId(input.format ?? DEFAULTS.format)),
          ModuleId.make(toWorkspaceModuleId(input.test ?? DEFAULTS.test)),
          ...((input.git ?? DEFAULTS.git)
            ? [ModuleId.make("workspace-devenv-git")]
            : []),
          ...devenvModules,
        ]);
      });

      const buildSelection = Effect.fn("CreateRequest.buildSelection")(
        function* (
          input: CreateInput,
          config: typeof StackConfig.Type,
          collected: ReadonlyArray<CollectedCreateTarget>,
        ) {
          return yield* buildSelectionFrom({
            catalog,
            collected,
            seedTargets: [
              {
                identity: new TargetIdentity({
                  kind: TargetKind.make("workspace"),
                  name: config.name,
                }),
                modules: yield* buildWorkspaceModules(input),
              },
            ],
          });
        },
      );

      const renderCommand = (input: CreateInput) =>
        pipe(
          [
            ["stack-effect", "create", quoteShellArg(input.name)],
            Arr.flatMap(input.targets, (target) => [
              "--target",
              quoteShellArg(target),
            ]),
            input.runtime && input.runtime !== DEFAULTS.runtime
              ? ["--runtime", input.runtime]
              : [],
            input.packageManager &&
            input.packageManager !== DEFAULTS.packageManager
              ? ["--package-manager", input.packageManager]
              : [],
            input.monorepo && input.monorepo !== DEFAULTS.monorepo
              ? ["--monorepo", quoteShellArg(input.monorepo)]
              : [],
            input.lint && input.lint !== DEFAULTS.lint
              ? ["--lint", quoteShellArg(input.lint)]
              : [],
            input.format && input.format !== DEFAULTS.format
              ? ["--format", quoteShellArg(input.format)]
              : [],
            input.test && input.test !== DEFAULTS.test
              ? ["--test", quoteShellArg(input.test)]
              : [],
            input.git === false ? ["--no-git"] : [],
          ],
          Arr.flatten,
          Arr.join(" "),
        );

      const normalizeInput = Effect.fn("CreateRequest.normalizeInput")(
        function* (input: CreateInput, root: Option.Option<string>) {
          yield* validateRuntimeOverrides(input);

          const { projectName, repoRoot } = yield* resolveNameAndRoot(
            input.name,
            root,
          );
          const config = buildDefaultConfig(projectName, input);
          const parsedTargets = yield* parseTargetSpecs(input.targets);
          const collected = yield* resolveDependencies([...parsedTargets]);
          const selection = yield* buildSelection(input, config, collected);

          return {
            input,
            repoRoot,
            config,
            selection,
            command: renderCommand(input),
            explicitOverrides: {
              runtime: input.runtime !== undefined,
              packageManager: input.packageManager !== undefined,
              monorepo: input.monorepo !== undefined,
              lint: input.lint !== undefined,
              format: input.format !== undefined,
              test: input.test !== undefined,
              git: input.git !== undefined,
            },
          } satisfies NormalizedCreateRequest;
        },
      );

      const normalize = Effect.fn("CreateRequest.normalize")(function* (
        flags: CreateFlagsInput,
      ) {
        const input = yield* readInput(flags);
        return yield* normalizeInput(input, flags.root);
      });

      return {
        buildDefaultConfig,
        normalize,
        normalizeInput,
        parseTargetSpecs,
        readInput,
        renderCommand,
        resolveNameAndRoot,
      } as const;
    }),
  },
) {
  static readonly layer = Layer.effect(
    CreateRequestService,
    CreateRequestService.make,
  );
}
