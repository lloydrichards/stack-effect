import { describe, layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { ModuleId, TargetKind } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CLI } from "./harness";

/**
 * Target identity used in CLI --target flag (kind/name).
 * Modules that use identity-based supportedOn dictate the target name.
 * For kind-based modules (server, client), we use a conventional name.
 */
interface MatrixEntry {
  readonly target: string;
  readonly modules: ReadonlyArray<string>;
  readonly label: string;
}

/**
 * Entry for testing modules with their optional children.
 * Tracks parent module and all optional children to add separately.
 */
interface ChildrenMatrixEntry {
  readonly target: string;
  readonly parentModule: string;
  readonly optionalChildren: ReadonlyArray<{
    readonly moduleId: string;
    readonly childTarget: string;
  }>;
  readonly label: string;
}

/**
 * Entry for testing a module that requires a catalog capability with a concrete
 * provider module selected from the current catalog.
 */
interface CapabilityMatrixEntry {
  readonly requiringTarget: string;
  readonly requiringModule: string;
  readonly providerTarget: string;
  readonly providerModule: string;
  readonly providerCount: number;
  readonly capability: string;
  readonly label: string;
}

/**
 * Canonical target names per kind. Identity-based modules override this
 * with their specific name (e.g., "package/domain", "package/ai").
 */
const defaultTargetNames = new Map([
  ["server", "api"],
  ["client-react", "web"],
  ["client-foldkit", "app"],
  ["cli", "app"],
  ["package", "domain"],
]);

/**
 * Groups modules by their actual target identity (kind/name).
 * For identity-based supportedOn, uses the identity's name.
 * For kind-based supportedOn, uses the default name.
 */
function groupModulesByTarget(
  modules: ReadonlyArray<{
    id: string;
    supportedOn: ReadonlyArray<
      | { _tag: "kind"; kind: string }
      | { _tag: "identity"; identity: { kind: string; name: string } }
    >;
    implies?: ReadonlyArray<{ targetKind: string; moduleId: string }>;
  }>,
): Map<string, ReadonlyArray<string>> {
  const groups = new Map<string, Array<string>>();

  for (const mod of modules) {
    for (const s of mod.supportedOn) {
      const target =
        s._tag === "identity"
          ? `${s.identity.kind}/${s.identity.name}`
          : `${s.kind}/${defaultTargetNames.get(s.kind) ?? s.kind}`;

      if (!groups.has(target)) groups.set(target, []);
      groups.get(target)!.push(mod.id);
    }
  }

  return groups;
}

const buildMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogService;
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

      if (moduleIds.length > 1) {
        entries.push({
          target,
          modules: moduleIds,
          label: `${target} + [all: ${moduleIds.join(", ")}]`,
        });
      }
    }
  }

  return entries;
});

const matrix = Effect.runSync(
  buildMatrix.pipe(Effect.provide(CatalogService.layer)),
);

const singleTargetEntries = matrix.filter(
  (e) =>
    !e.target.startsWith("client-react") &&
    !e.target.startsWith("client-foldkit"),
);

function getModuleTarget(mod: {
  supportedOn: ReadonlyArray<
    | { _tag: "kind"; kind: string }
    | { _tag: "identity"; identity: { kind: string; name: string } }
  >;
}): string {
  const s = mod.supportedOn[0];
  if (!s) return "unknown/unknown";
  return s._tag === "identity"
    ? `${s.identity.kind}/${s.identity.name}`
    : `${s.kind}/${defaultTargetNames.get(s.kind) ?? s.kind}`;
}

function identityToTarget(identity: { kind: string; name: string }): string {
  return `${identity.kind}/${identity.name}`;
}

const buildChildrenMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogService;
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

const childrenMatrix = Effect.runSync(
  buildChildrenMatrix.pipe(Effect.provide(CatalogService.layer)),
);

const buildCapabilityMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogService;
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
          providerCount: providers.length,
          capability: dependency.capability,
          label: `${getModuleTarget(mod)} + ${mod.id} with ${dependency.capability} provider ${provider.id}`,
        });
      }
    }
  }

  return entries;
});

const capabilityMatrix = Effect.runSync(
  buildCapabilityMatrix.pipe(Effect.provide(CatalogService.layer)),
);

const buildFullStackMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogService;

  const clientKinds = [
    TargetKind.make("client-react"),
    TargetKind.make("client-foldkit"),
  ] as const;

  const results: Array<{
    label: string;
    serverTarget: string;
    serverModules: ReadonlyArray<string>;
    clientTarget: string;
    clientModules: ReadonlyArray<string>;
  }> = [];

  for (const kind of clientKinds) {
    const clientModules = yield* catalog.getSupportedModules(kind);

    for (const clientMod of clientModules) {
      const implies = clientMod.implies ?? [];
      if (implies.length === 0) continue;

      const serverModuleIds = implies
        .filter((imp) => imp.targetKind === "server")
        .map((imp) => imp.moduleId);

      if (serverModuleIds.length > 0) {
        results.push({
          label: `full-stack: ${clientMod.id} → server [${serverModuleIds.join(", ")}]`,
          serverTarget: `server/${defaultTargetNames.get("server")}`,
          serverModules: serverModuleIds,
          clientTarget: `${kind}/${defaultTargetNames.get(kind)}`,
          clientModules: [clientMod.id],
        });
      }
    }
  }

  return results;
});

const fullStackMatrix = Effect.runSync(
  buildFullStackMatrix.pipe(Effect.provide(CatalogService.layer)),
);

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

/**
 * Acceptance tests for various module combinations in the matrix.
 *
 * The matrix is generated dynamically from the CatalogService, ensuring that
 * all supported module combinations are tested. Each test scaffolds a project,
 * adds the specified modules, and verifies that the resulting project is valid
 * (e.g., type checks successfully).
 */
describe("matrix", () => {
  layer(CLI.layer)("single-target modules", (it) => {
    for (const entry of singleTargetEntries) {
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
              entry.target,
              "--modules",
              entry.modules.join(","),
            );
            yield* cli.expectExitCode(0);

            yield* cli.withinProject(name, function* (project) {
              yield* expectInstallPasses(project);
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 120_000 },
      );
    }
  });

  layer(CLI.layer)("full-stack (client + server)", (it) => {
    for (const entry of fullStackMatrix) {
      it.effect(
        entry.label,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const name = `matrix-fullstack-${entry.clientModules.join("-")}`;
            const root = `${cli.workdir}/${name}`;

            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              entry.serverTarget,
              "--modules",
              entry.serverModules.join(","),
            );
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              entry.clientTarget,
              "--modules",
              entry.clientModules.join(","),
            );
            yield* cli.expectExitCode(0);

            yield* cli.withinProject(name, function* (project) {
              yield* expectInstallPasses(project);
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 120_000 },
      );
    }
  });

  layer(CLI.layer)("full-stack all client modules together", (it) => {
    const byClientKind = new Map<
      string,
      { serverModules: Set<string>; clientModules: Set<string> }
    >();
    for (const entry of fullStackMatrix) {
      const kind = entry.clientTarget;
      if (!byClientKind.has(kind)) {
        byClientKind.set(kind, {
          serverModules: new Set(),
          clientModules: new Set(),
        });
      }
      const group = byClientKind.get(kind)!;
      for (const m of entry.serverModules) group.serverModules.add(m);
      for (const m of entry.clientModules) group.clientModules.add(m);
    }

    for (const [clientTarget, group] of byClientKind) {
      const kindSlug = clientTarget.replace("/", "-");
      it.effect(
        `all ${clientTarget} modules with server dependencies`,
        () =>
          Effect.gen(function* () {
            const cli = yield* CLI;
            const name = `matrix-fullstack-all-${kindSlug}`;
            const root = `${cli.workdir}/${name}`;

            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              `server/${defaultTargetNames.get("server")}`,
              "--modules",
              [...group.serverModules].join(","),
            );
            yield* cli.expectExitCode(0);

            yield* cli.run(
              "add",
              "--yes",
              "--root",
              root,
              "--target",
              clientTarget,
              "--modules",
              [...group.clientModules].join(","),
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
              entry.target,
              "--modules",
              entry.parentModule,
            );
            yield* cli.expectExitCode(0);

            for (const child of entry.optionalChildren) {
              yield* cli.run(
                "add",
                "--yes",
                "--root",
                root,
                "--target",
                child.childTarget,
                "--modules",
                child.moduleId,
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
                entry.requiringTarget,
                "--modules",
                entry.requiringModule,
              );

              if (entry.providerCount === 1) {
                yield* cli.expectExitCode(0);

                yield* cli.withinProject(name, function* (project) {
                  yield* expectInstallPasses(project);
                  yield* project.expectTypeCheckPasses();
                });
              } else {
                yield* cli.expectExitCode(1);
              }
            }).pipe(Effect.provide(CLI.layer)),
          { timeout: 180_000 },
        );
      }
    });
  }
});
