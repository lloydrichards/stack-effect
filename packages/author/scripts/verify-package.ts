// Proves the package installs and builds a catalog in a clean project with
// no links into this repository. Pass `--registry <version>` to install the
// published version instead of a freshly packed tarball.
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const packageDir = join(import.meta.dirname, "..");
const fixtureDir = join(packageDir, "../authoring/test/fixtures/standalone");
const { name, peerDependencies } = JSON.parse(
  readFileSync(join(packageDir, "package.json"), "utf8"),
) as { name: string; peerDependencies: Record<string, string> };
const effectVersion = peerDependencies["effect"];
if (effectVersion === undefined) throw new Error("effect peer is missing");

const registryAt = process.argv.indexOf("--registry");
const registryVersion =
  registryAt === -1 ? undefined : process.argv[registryAt + 1];

const run = (command: string, args: ReadonlyArray<string>, cwd: string) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });

const project = mkdtempSync(join(tmpdir(), "stack-effect-author-"));
try {
  const dependency =
    registryVersion ??
    (() => {
      run("bun", ["run", "build"], packageDir);
      const [packed] = JSON.parse(
        run(
          "npm",
          ["pack", "--json", "--pack-destination", project],
          packageDir,
        ),
      ) as Array<{ filename: string; files: Array<{ path: string }> }>;
      if (packed === undefined) throw new Error("npm pack produced nothing");
      const unexpected = packed.files
        .map((file) => file.path)
        .filter(
          (path) =>
            !["package.json", "README.md", "LICENSE"].includes(path) &&
            !path.startsWith("dist/"),
        );
      if (unexpected.length > 0)
        throw new Error(
          `Tarball ships unexpected files: ${unexpected.join(", ")}`,
        );
      return `file:./${packed.filename}`;
    })();

  // The standalone fixture, importing the package the way an author would.
  cpSync(fixtureDir, join(project, "catalog"), { recursive: true });
  for (const file of readdirSync(join(project, "catalog"))) {
    if (!file.endsWith(".ts")) continue;
    const path = join(project, "catalog", file);
    writeFileSync(
      path,
      readFileSync(path, "utf8")
        .replaceAll('"@repo/authoring"', `"${name}"`)
        .replace(/from "\.\/(\w+)"/g, 'from "./$1.ts"'),
    );
  }

  writeFileSync(
    join(project, "build.ts"),
    `import { NodeServices } from "@effect/platform-node";
import { buildCatalog, type CatalogInput, defineModules, templates } from "${name}";
import { Effect } from "effect";
import { readFileSync } from "node:fs";
import { catalog, root } from "./catalog/catalog.ts";

const build = (input: CatalogInput) =>
  Effect.runPromise(
    buildCatalog(input, { catalogId: "acme", root }).pipe(
      Effect.match({
        onFailure: (error) => ({ ok: false as const, error }),
        onSuccess: (result) => ({ ok: true as const, result }),
      }),
      Effect.provide(NodeServices.layer),
    ),
  );

const built = await build(catalog);
if (!built.ok) throw new Error(built.error.message);
const golden = readFileSync(new URL("./catalog/golden/catalog.json", import.meta.url), "utf8");
if (built.result.json !== golden) throw new Error("Built catalog differs from the golden document");

// A definition whose template is missing must fail with a located issue.
const template = templates(new URL("./catalog/templates/", import.meta.url));
const broken = defineModules(new URL("./catalog/broken.ts", import.meta.url), [
  {
    id: "acme-broken",
    title: "Broken",
    description: "Refers to a missing template",
    supportedOn: [{ _tag: "kind", kind: "workspace" }],
    dependencies: [],
    contributions: [{ _tag: "file", path: "broken.txt", contents: template("./missing.txt") }],
  },
]);
const failed = await build({ ...catalog, modules: [...catalog.modules, broken] });
if (failed.ok || !failed.error.issues.some((issue) => issue.code === "missing-template"))
  throw new Error("A missing template was not reported");
console.log(failed.error.issues.map((issue) => issue.message).join("; "));
`,
  );
  writeFileSync(
    join(project, "package.json"),
    JSON.stringify(
      {
        name: "author-smoke",
        private: true,
        type: "module",
        dependencies: {
          [name]: dependency,
          "@effect/platform-node": effectVersion,
          effect: effectVersion,
        },
        devDependencies: { "@types/node": "^24", typescript: "~5.9.3" },
        // Effect RCs are not mutually compatible; keep platform packages on the peer.
        overrides: { "@effect/platform-node-shared": effectVersion },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "es2022",
        module: "nodenext",
        moduleResolution: "nodenext",
        strict: true,
        noEmit: true,
        allowImportingTsExtensions: true,
        skipLibCheck: false,
        types: ["node"],
      },
      include: ["build.ts", "catalog/*.ts"],
    }),
  );

  run("npm", ["install", "--no-audit", "--no-fund"], project);
  run("npx", ["tsc", "-p", "."], project);
  const output = run("node", ["build.ts"], project);
  console.log(`${name}@${registryVersion ?? "packed"}: ${output.trim()}`);
} finally {
  rmSync(project, { recursive: true, force: true });
}
