import * as nodeFs from "node:fs/promises";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { linkWorkspacePackages, WorkspaceCommandFailed } from "./catalog";

const roots: Array<string> = [];

const makeWorkspace = async () => {
  const root = await nodeFs.mkdtemp(
    nodePath.join(nodeOs.tmpdir(), "catalog-link-"),
  );
  roots.push(root);
  await nodeFs.mkdir(nodePath.join(root, "packages", "ai"), {
    recursive: true,
  });
  await nodeFs.mkdir(nodePath.join(root, "node_modules", "@repo"), {
    recursive: true,
  });
  return root;
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => nodeFs.rm(root, { recursive: true })),
  );
});

describe("linkWorkspacePackages", () => {
  it("accepts an already-materialized correct workspace package link", async () => {
    const root = await makeWorkspace();
    const target = nodePath.join(root, "packages", "ai");
    const link = nodePath.join(root, "node_modules", "@repo", "ai");
    await nodeFs.symlink(target, link, "dir");

    await Effect.runPromise(linkWorkspacePackages(root));

    expect(await nodeFs.realpath(link)).toBe(await nodeFs.realpath(target));
  });

  it("rejects an existing link that resolves to the wrong package", async () => {
    const root = await makeWorkspace();
    const wrong = nodePath.join(root, "packages", "wrong");
    await nodeFs.mkdir(wrong);
    await nodeFs.symlink(
      wrong,
      nodePath.join(root, "node_modules", "@repo", "ai"),
      "dir",
    );

    const error = await Effect.runPromise(
      Effect.flip(linkWorkspacePackages(root)),
    );

    expect(error).toBeInstanceOf(WorkspaceCommandFailed);
    expect(error.command).toBe("link @repo/ai");
  });
});
