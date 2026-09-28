/* oxlint-disable effecttsgo/async-function, effecttsgo/node-builtin-import -- This Nx build helper uses runtime file APIs and is intentionally outside the Effect runtime. */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
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

const childDirectories = async (path) =>
  (await readDirectoryIfPresent(path))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

const projectRoots = (
  await Promise.all(
    workspaceDirectories.map(async (directory) =>
      (await childDirectories(join(workspaceRoot, directory))).map((name) =>
        join(workspaceRoot, directory, name),
      ),
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
