/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- This Nx build helper uses runtime file APIs and is intentionally outside the Effect runtime. */
import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const workspaceRoot = process.cwd();
const workspaceDirectories = ["apps", "packages"];

const isEnvironmentFile = (name) =>
  name === ".env" || name.startsWith(".env.") || name.endsWith(".env");

const readDirectoryIfPresent = (path) =>
  readdir(path, { withFileTypes: true }).catch((error) => {
    if (
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }
    throw error;
  });

// A package root owns its descendants; fixture/build manifests are not projects.
const discoverProjectRoots = async (directory) => {
  const info = await lstat(directory).catch((error) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (info === undefined) return [];
  if (info.isSymbolicLink())
    throw new Error(`Symbolic workspace grouping directory is unsupported: ${directory}`);
  if (!info.isDirectory()) return [];
  const entries = await readDirectoryIfPresent(directory);
  if (entries.some((entry) => entry.name === "package.json" && entry.isFile()))
    return [directory];
  return (
    await Promise.all(
      entries
        .filter((entry) =>
          !entry.name.startsWith(".") && entry.name.toLowerCase() !== "node_modules" &&
          (entry.isDirectory() || entry.isSymbolicLink()),
        )
        .map((entry) => discoverProjectRoots(join(directory, entry.name))),
    )
  ).flat();
};

const projectRoots = (
  await Promise.all(
    workspaceDirectories.map((directory) =>
      discoverProjectRoots(join(workspaceRoot, directory)),
    ),
  )
).flat();

const environmentFiles = (
  await Promise.all(
    [workspaceRoot, ...projectRoots].map(async (projectRoot) =>
      (await readDirectoryIfPresent(projectRoot))
        .filter((entry) => entry.isFile() && isEnvironmentFile(entry.name))
        .map((entry) => join(projectRoot, entry.name)),
    ),
  )
).flat();

const hash = createHash("sha256");

const environmentFileContents = await Promise.all(
  environmentFiles.sort().map(async (path) => [path, await readFile(path)]),
);

environmentFileContents.forEach(([path, contents]) => {
  hash.update(relative(workspaceRoot, path));
  hash.update("\0");
  hash.update(contents);
  hash.update("\0");
});

process.stdout.write(hash.digest("hex"));
