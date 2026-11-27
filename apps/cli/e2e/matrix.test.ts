import { describe, layer } from "@effect/vitest";
import { OfficialCatalogLayer } from "@repo/catalog-official/service";
import { CatalogReader } from "@repo/catalog/Catalog";
import { ModuleId } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CLI } from "./harness";

/**
 * Target identity used in CLI --target flag (kind/name).
 * Modules that use identity-based supportedOn dictate the target name.
 * For kind-based modules (server, client), we use a conventional name.
 */
type MatrixEntry = {
  readonly target: string;
  readonly modules: ReadonlyArray<string>;
  readonly label: string;
};

type ProviderSelection = {
  readonly target: string;
  readonly moduleId: string;
};

type GeneratedModuleExpectation = {
  readonly files: ReadonlyArray<string>;
  readonly contents?: ReadonlyArray<{
    readonly path: string;
    readonly pattern: string | RegExp;
  }>;
};

/**
 * Entry for testing modules with their optional children.
 * Tracks parent module and all optional children to add separately.
 */
type ChildrenMatrixEntry = {
  readonly target: string;
  readonly parentModule: string;
  readonly optionalChildren: ReadonlyArray<{
    readonly moduleId: string;
    readonly childTarget: string;
  }>;
  readonly label: string;
};

/**
 * Entry for testing a module that requires a catalog capability with a concrete
 * provider module selected from the current catalog.
 */
type CapabilityMatrixEntry = {
  readonly requiringTarget: string;
  readonly requiringModule: string;
  readonly providerTarget: string;
  readonly providerModule: string;
  readonly capability: string;
  readonly label: string;
};

/**
 * Canonical target names per kind. Identity-based modules override this
 * with their specific name (e.g., "package/domain", "package/ai").
 */
const defaultTargetNames = new Map([
  ["server", ""],
  ["cloudflare-worker", "api"],
  ["client-react", "web"],
  ["client-foldkit", "app"],
  ["server-mcp", ""],
  ["cli", ""],
  ["package", "library"],
]);

const catalogModules = await Effect.runPromise(
  Effect.map(CatalogReader, (catalog) => catalog.getModules()).pipe(
    Effect.provide(OfficialCatalogLayer),
  ),
);
const getCapabilityProviders = await Effect.runPromise(
  Effect.map(CatalogReader, (catalog) =>
    catalog.getCapabilityProviders.bind(catalog),
  ).pipe(Effect.provide(OfficialCatalogLayer)),
);
const catalogModulesById = new Map(
  catalogModules.map((module) => [module.id, module]),
);

const requiredProviderSelections = (
  moduleIds: ReadonlyArray<string>,
): ReadonlyArray<ProviderSelection> => {
  const visited = new Set<string>();
  const selections = new Map<string, ProviderSelection>();

  const visit = (moduleId: string) => {
    if (visited.has(moduleId)) return;
    visited.add(moduleId);

    const module = catalogModulesById.get(ModuleId.make(moduleId));
    if (!module) return;

    for (const implication of module.implies ?? []) {
      visit(implication.moduleId);
    }

    for (const dependency of module.dependencies) {
      if (dependency._tag === "required-module") {
        visit(dependency.moduleId);
        continue;
      }
      if (dependency._tag !== "required-capability") continue;

      const providers = getCapabilityProviders({
        capability: dependency.capability,
        target: dependency.target,
      });
      const provider =
        providers.find((candidate) => moduleIds.includes(candidate.id)) ??
        providers[0];
      if (!provider) continue;

      const target = identityToTarget(dependency.target);
      selections.set(`${target}:${dependency.capability}`, {
        target,
        moduleId: provider.id,
      });
    }
  };

  for (const moduleId of moduleIds) visit(moduleId);
  return Array.from(selections.values());
};

const requiredProviderArgs = (moduleIds: ReadonlyArray<string>) =>
  requiredProviderSelections(moduleIds).flatMap((provider) => [
    "--target",
    `${provider.target}:${provider.moduleId}`,
  ]);

/**
 * Groups modules by their actual target identity (kind/name).
 * For identity-based supportedOn, uses the identity's name.
 * For kind-based supportedOn, uses the default name.
 */
const groupModulesByTarget = (
  modules: ReadonlyArray<{
    id: string;
    supportedOn: ReadonlyArray<
      | { _tag: "kind"; kind: string }
      | { _tag: "identity"; identity: { kind: string; name: string } }
    >;
    implies?: ReadonlyArray<{ targetKind: string; moduleId: string }>;
  }>,
): Map<string, ReadonlyArray<string>> => {
  const groups = new Map<string, Array<string>>();

  for (const mod of modules) {
    for (const s of mod.supportedOn) {
      const target =
        s._tag === "identity"
          ? `${s.identity.kind}/${s.identity.name}`
          : `${s.kind}/${defaultTargetNames.get(s.kind) ?? s.kind}`;

      groups.set(target, [...(groups.get(target) ?? []), mod.id]);
    }
  }

  return groups;
};

const providedCapabilities = (moduleId: string) =>
  catalogModulesById.get(ModuleId.make(moduleId))?.provides ?? [];

/** Maximal bundles choose one provider for each capability. */
const maximalBundles = (moduleIds: ReadonlyArray<string>) =>
  [...new Set(moduleIds.flatMap(providedCapabilities))].reduce<
    ReadonlyArray<ReadonlyArray<string>>
  >(
    (bundles, capability) =>
      bundles.flatMap((bundle) => {
        const providers = bundle.filter((id) =>
          providedCapabilities(id).includes(capability),
        );
        return providers.length <= 1
          ? [bundle]
          : providers.map((provider) =>
              bundle.filter(
                (id) =>
                  id === provider ||
                  (!providedCapabilities(id).includes(capability) &&
                    !catalogModulesById
                      .get(ModuleId.make(provider))
                      ?.conflictsWith?.includes(ModuleId.make(id))),
              ),
            );
      }),
    [moduleIds],
  );

const buildMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const entries: Array<MatrixEntry> = [];

  for (const kind of catalog.getTargetKinds({ visibility: "public" })) {
    const modules = yield* catalog.getSupportedModules(kind);
    const grouped = groupModulesByTarget(modules);

    for (const [target, moduleIds] of grouped) {
      for (const moduleId of moduleIds) {
        entries.push({
          target,
          modules: [moduleId],
          label: `${target} + ${moduleId}`,
        });
      }

      for (const bundle of maximalBundles(moduleIds).filter(
        (bundle) => bundle.length > 1,
      )) {
        entries.push({
          target,
          modules: bundle,
          label: `${target} + [all: ${bundle.join(", ")}]`,
        });
      }
    }
  }

  return entries;
});

const matrix = await Effect.runPromise(
  buildMatrix.pipe(Effect.provide(OfficialCatalogLayer)),
);

const individualModuleEntries = matrix.filter(
  (entry) => entry.modules.length === 1,
);
const maximalTargetEntries = matrix.filter((entry) => entry.modules.length > 1);

const impliedServerFiles: Readonly<Partial<Record<string, string>>> = {
  "client-react-http-api": "src/api/Health.ts",
  "client-react-http-api-todos": "src/api/Todo.ts",
  "client-react-http-rpc": "src/rpc/Event.ts",
  "client-react-chat": "src/rpc/Chat.ts",
  "client-react-ws-presence": "src/rpc/Presence.ts",
  "client-foldkit-http-api": "src/api/Health.ts",
  "client-foldkit-http-rpc": "src/rpc/Event.ts",
  "client-foldkit-chat": "src/rpc/Chat.ts",
  "client-foldkit-ws-presence": "src/rpc/Presence.ts",
};

const generatedModuleExpectations: Readonly<
  Record<string, GeneratedModuleExpectation>
> = {
  ...Object.fromEntries(
    (["server", "cli"] as const).flatMap((kind) =>
      (["tools", "resources", "prompts"] as const).map((capability) => [
        `${kind}-chat-mcp-${capability}`,
        {
          files: [
            `apps/${kind === "server" ? "server-api" : "cli-app"}/src/mcp/McpClient.ts`,
            `apps/${kind === "server" ? "server-api" : "cli-app"}/src/mcp/Mcp${{ tools: "Tools", resources: "Resources", prompts: "Prompts" }[capability]}.ts`,
          ],
        },
      ]),
    ),
  ),
};

const getModuleTarget = (mod: {
  supportedOn: ReadonlyArray<
    | { _tag: "kind"; kind: string }
    | { _tag: "identity"; identity: { kind: string; name: string } }
  >;
}) => {
  const s = mod.supportedOn[0];
  if (!s) return "unknown/unknown";
  return s._tag === "identity"
    ? `${s.identity.kind}/${s.identity.name}`
    : `${s.kind}/${defaultTargetNames.get(s.kind) ?? s.kind}`;
};

const identityToTarget = (identity: { kind: string; name: string }) => {
  if (
    (identity.kind === "server" && identity.name === "api") ||
    (identity.kind === "cli" && identity.name === "app")
  )
    return `${identity.kind}/`;
  return `${identity.kind}/${identity.name}`;
};

const buildChildrenMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const entries: Array<ChildrenMatrixEntry> = [];

  const allModules = catalog.getModules();

  const moduleMap = new Map(allModules.map((m) => [m.id, m]));

  for (const mod of allModules) {
    const children = mod.children as
      | Array<{ moduleId: string; requirement: "required" | "optional" }>
      | undefined;

    if (!children || children.length === 0) continue;

    const optionalChildren = children.filter(
      (c) => c.requirement === "optional",
    );
    if (optionalChildren.length === 0) continue;

    const parentTarget = getModuleTarget(mod);

    const childrenWithTargets = optionalChildren.map((child) => {
      const childMod = moduleMap.get(ModuleId.make(child.moduleId));
      return {
        moduleId: child.moduleId,
        childTarget: childMod ? getModuleTarget(childMod) : parentTarget,
      };
    });

    entries.push({
      target: parentTarget,
      parentModule: mod.id,
      optionalChildren: childrenWithTargets,
      label: `${parentTarget} + ${mod.id} (with optional: ${optionalChildren.map((c) => c.moduleId).join(", ")})`,
    });
  }

  return entries;
});

const childrenMatrix = await Effect.runPromise(
  buildChildrenMatrix.pipe(Effect.provide(OfficialCatalogLayer)),
);

const buildCapabilityMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogReader;
  const entries: Array<CapabilityMatrixEntry> = [];
  const allModules = catalog.getModules();

  for (const mod of allModules) {
    for (const dependency of mod.dependencies) {
      if (dependency._tag !== "required-capability") continue;

      const providers = catalog.getCapabilityProviders({
        capability: dependency.capability,
        target: dependency.target,
      });

      for (const provider of providers) {
        entries.push({
          requiringTarget: getModuleTarget(mod),
          requiringModule: mod.id,
          providerTarget: identityToTarget(dependency.target),
          providerModule: provider.id,
          capability: dependency.capability,
          label: `${getModuleTarget(mod)} + ${mod.id} with ${dependency.capability} provider ${provider.id}`,
        });
      }
    }
  }

  return entries;
});

const capabilityMatrix = await Effect.runPromise(
  buildCapabilityMatrix.pipe(Effect.provide(OfficialCatalogLayer)),
);

// Non-interactive add needs a concrete target for the catalog's server implications.
const impliedServerArgs = ({ target, modules }: MatrixEntry): Array<string> => {
  if (!target.startsWith("client-")) return [];

  const serverModules = new Set(
    modules.flatMap((id) =>
      (catalogModulesById.get(ModuleId.make(id))?.implies ?? [])
        .filter((implication) => implication.targetKind === "server")
        .map((implication) => implication.moduleId),
    ),
  );
  return serverModules.size === 0
    ? []
    : ["--target", `server/:${[...serverModules].join(",")}`];
};

const assertImpliedServerModules = (
  project: { expectFileExists: (path: string) => Effect.Effect<void> },
  moduleIds: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const files = new Set(
      moduleIds
        .map((id) => impliedServerFiles[id])
        .filter((file) => file !== undefined),
    );
    if (files.size === 0) return;

    yield* project.expectFileExists("apps/server-api/package.json");
    for (const file of files) {
      yield* project.expectFileExists(`apps/server-api/${file}`);
    }
  });

const expectInstallPasses = (project: {
  install: () => Effect.Effect<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
}) =>
  project
    .install()
    .pipe(
      Effect.flatMap((result) =>
        result.exitCode === 0
          ? Effect.void
          : Effect.die(
              new Error(
                `Install failed (exit ${result.exitCode})\nstdout: ${result.stdout.slice(0, 500)}\nstderr: ${result.stderr.slice(0, 500)}`,
              ),
            ),
      ),
    );

const assertGeneratedModuleExpectations = (
  project: {
    expectFileExists: (path: string) => Effect.Effect<void>;
    expectFileContaining: (
      path: string,
      pattern: string | RegExp,
    ) => Effect.Effect<void>;
  },
  modules: ReadonlyArray<string>,
) =>
  Effect.forEach(
    modules,
    (moduleId) => {
      const expectation = generatedModuleExpectations[moduleId];
      if (!expectation) return Effect.void;

      return Effect.all([
        Effect.forEach(
          expectation.files,
          (path) => project.expectFileExists(path),
          {
            discard: true,
          },
        ),
        Effect.forEach(
          expectation.contents ?? [],
          ({ path, pattern }) => project.expectFileContaining(path, pattern),
          { discard: true },
        ),
      ]).pipe(Effect.asVoid);
    },
    { discard: true },
  );

/**
 * Acceptance tests for various module combinations in the matrix.
 *
 * The matrix covers each public module, maximal target bundles, optional
 * children, and capability providers. Client rows include their implied server modules.
 */
describe("matrix", () => {
  layer(CLI.layer)("every public module", (it) => {
    for (const entry of individualModuleEntries) {
      it.effect(
        entry.label,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const name = `matrix-${entry.target.replace("/", "-")}-${entry.modules.join("-")}`;
            const root = `${cli.workdir}/${name}`;

            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `${entry.target}:${entry.modules.join(",")}`,
              ...impliedServerArgs(entry),
              ...requiredProviderArgs(entry.modules),
            );
            yield* cli.expectExitCode(0);

            yield* cli.withinProject(name, function* (project) {
              yield* assertGeneratedModuleExpectations(project, entry.modules);
              yield* assertImpliedServerModules(project, entry.modules);
              yield* expectInstallPasses(project);
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 120_000 },
      );
    }
  });

  layer(CLI.layer)("maximal target bundles", (it) => {
    for (const entry of maximalTargetEntries) {
      it.effect(
        entry.label,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const name = `matrix-maximal-${entry.target.replace("/", "-")}`;
            const root = `${cli.workdir}/${name}`;

            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `${entry.target}:${entry.modules.join(",")}`,
              ...impliedServerArgs(entry),
              ...requiredProviderArgs(entry.modules),
            );
            yield* cli.expectExitCode(0);

            yield* cli.withinProject(name, function* (project) {
              yield* assertGeneratedModuleExpectations(project, entry.modules);
              yield* assertImpliedServerModules(project, entry.modules);
              yield* expectInstallPasses(project);
              yield* project.expectFormatPasses();
              yield* project.expectLintPasses();
              yield* project.expectTypeCheckPasses();
              yield* project.expectBuildSucceeds();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 180_000 },
      );
    }
  });

  layer(CLI.layer)("modules with optional children (maximal)", (it) => {
    for (const entry of childrenMatrix) {
      it.effect(
        entry.label,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const sluggedModules = [
              entry.parentModule,
              ...entry.optionalChildren.map((c) => c.moduleId),
            ].join("-");
            const name = `matrix-children-${entry.target.replace("/", "-")}-${sluggedModules}`;
            const root = `${cli.workdir}/${name}`;

            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `${entry.target}:${entry.parentModule}`,
              ...requiredProviderArgs([entry.parentModule]),
            );
            yield* cli.expectExitCode(0);

            for (const child of entry.optionalChildren) {
              yield* cli.run(
                "add",
                "--yes",
                "--root",
                root,
                "--target",
                `${child.childTarget}:${child.moduleId}`,
                ...requiredProviderArgs([child.moduleId]),
              );
              yield* cli.expectExitCode(0);
            }

            yield* cli.withinProject(name, function* (project) {
              yield* expectInstallPasses(project);
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 180_000 },
      );
    }
  });

  if (capabilityMatrix.length > 0) {
    layer(CLI.layer)("modules with required capabilities", (it) => {
      for (const entry of capabilityMatrix) {
        it.effect(
          entry.label,
          () =>
            Effect.gen(function* () {
              const cli = yield* CLI;
              const name = `matrix-capability-${entry.capability}-${entry.requiringModule}-${entry.providerModule}`;
              const root = `${cli.workdir}/${name}`;

              yield* cli.run("init", name, "--yes", "--root", cli.workdir);
              yield* cli.expectExitCode(0);

              yield* cli.run(
                "add",
                "--yes",
                "--root",
                root,
                "--target",
                `${entry.providerTarget}:${entry.providerModule}`,
                "--target",
                `${entry.requiringTarget}:${entry.requiringModule}`,
              );
              yield* cli.expectExitCode(0);

              yield* cli.withinProject(name, function* (project) {
                yield* expectInstallPasses(project);
                yield* project.expectTypeCheckPasses();
              });
            }).pipe(Effect.provide(CLI.layer)),
          { timeout: 180_000 },
        );
      }
    });
  }
});
