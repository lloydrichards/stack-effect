import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert, describe, it } from "@effect/vitest";

const entry = fileURLToPath(new URL("../index.ts", import.meta.url));
const source = new URL("../skills/stack-effect/SKILL.md", import.meta.url);

const run = (cwd: string, ...args: ReadonlyArray<string>) =>
  spawnSync("bun", [entry, "skill", ...args], { cwd, encoding: "utf-8" });

describe("skill command", () => {
  it("prints the bundled Markdown and replaces a local copy only with --force", () => {
    const repository = mkdtempSync(join(tmpdir(), "stack-effect-skill-"));
    const destination = join(
      repository,
      ".agents/skills/stack-effect/SKILL.md",
    );
    const markdown = readFileSync(source, "utf8");

    try {
      const read = run(repository, "read");
      assert.strictEqual(read.status, 0);
      assert.strictEqual(read.stdout, markdown);
      assert.strictEqual(read.stderr, "");

      const install = run(tmpdir(), "write", "--path", repository);
      assert.strictEqual(install.status, 0);
      assert.strictEqual(readFileSync(destination, "utf8"), markdown);

      writeFileSync(destination, "local edit\n");
      const conflict = run(repository, "write");
      assert.strictEqual(conflict.status, 1);
      assert.include(conflict.stderr, "--force");
      assert.strictEqual(readFileSync(destination, "utf8"), "local edit\n");

      assert.strictEqual(run(repository, "write", "--force").status, 0);
      assert.strictEqual(readFileSync(destination, "utf8"), markdown);
    } finally {
      rmSync(repository, { recursive: true, force: true });
    }
  }, 20_000);

  it("rejects a symlink in the install path", () => {
    const repository = mkdtempSync(join(tmpdir(), "stack-effect-skill-link-"));
    const external = mkdtempSync(
      join(tmpdir(), "stack-effect-skill-external-"),
    );

    try {
      symlinkSync(external, join(repository, ".agents"), "dir");

      const install = run(repository, "write", "--force");
      assert.strictEqual(install.status, 1);
      assert.include(install.stderr, "Skill path contains a symlink");
      assert.throws(() =>
        readFileSync(join(external, "skills/stack-effect/SKILL.md")),
      );
    } finally {
      rmSync(repository, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});
