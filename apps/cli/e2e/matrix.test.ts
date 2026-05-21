import { describe, layer } from "@effect/vitest";
import { CatalogService } from "@repo/catalog";
import { TargetKind } from "@repo/domain/Catalog";
import { Effect } from "effect";
import { CLI } from "./harness";

// ---------------------------------------------------------------------------
// Matrix generation – derives valid combos from CatalogService at import time
// ---------------------------------------------------------------------------

/**
 * Target identity used in CLI --target flag (kind/name).
 * Modules that use identity-based supportedOn dictate the target name.
 * For kind-based modules (server, client), we use a conventional name.
 */
interface MatrixEntry {
  readonly target: string; // "kind/name" for --target
  readonly modules: ReadonlyArray<string>; // module IDs for --modules
  readonly label: string; // human-readable test name
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
  ["package", "domain"], // fallback; overridden by identity modules
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

// ---------------------------------------------------------------------------
// Build the matrix using CatalogService
// ---------------------------------------------------------------------------

const buildMatrix = Effect.gen(function* () {
  const catalog = yield* CatalogService;
  const entries: Array<MatrixEntry> = [];

  // For each non-init target kind, get supported modules and group by identity
  for (const kind of catalog.getTargetKinds({ visibility: "public" })) {
    const modules = yield* catalog.getSupportedModules(kind);
    const grouped = groupModulesByTarget(modules as any);

    for (const [target, moduleIds] of grouped) {
      // Individual module tests
      for (const moduleId of moduleIds) {
        entries.push({
          target,
          modules: [moduleId],
          label: `${target} + ${moduleId}`,
        });
      }

      // All modules together (only if > 1 module)
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

// Separate entries that have cross-target implications (client modules)
const singleTargetEntries = matrix.filter(
  (e) =>
    !e.target.startsWith("client-react") &&
    !e.target.startsWith("client-foldkit"),
);

// ---------------------------------------------------------------------------
// Full-stack combos: pair each client combo with its required server modules
// ---------------------------------------------------------------------------

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

            // Init project
            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            // Add modules to target
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

            // Validate
            yield* cli.withinProject(name, function* (project) {
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

            // Init project
            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            // Add server modules first (satisfies implications)
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

            // Add client modules
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

            // Validate full project
            yield* cli.withinProject(name, function* (project) {
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 120_000 },
      );
    }
  });

  layer(CLI.layer)("full-stack all client modules together", (it) => {
    // Group full-stack entries by client target kind
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

            // Init
            yield* cli.run("init", name, "--yes", "--root", cli.workdir);
            yield* cli.expectExitCode(0);

            // Add all server modules
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

            // Add all client modules
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

            // Validate
            yield* cli.withinProject(name, function* (project) {
              yield* project.expectTypeCheckPasses();
            });
          }).pipe(Effect.provide(CLI.layer)),
        { timeout: 180_000 },
      );
    }
  });
});
