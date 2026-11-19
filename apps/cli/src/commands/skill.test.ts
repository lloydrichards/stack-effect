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
import { describe, expect, it } from "vitest";

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
      expect(read.status).toBe(0);
      expect(read.stdout).toBe(markdown);
      expect(read.stderr).toBe("");

      const install = run(tmpdir(), "write", "--path", repository);
      expect(install.status).toBe(0);
      expect(readFileSync(destination, "utf8")).toBe(markdown);

      writeFileSync(destination, "local edit\n");
      const conflict = run(repository, "write");
      expect(conflict.status).toBe(1);
      expect(conflict.stderr).toContain("--force");
      expect(readFileSync(destination, "utf8")).toBe("local edit\n");

      expect(run(repository, "write", "--force").status).toBe(0);
      expect(readFileSync(destination, "utf8")).toBe(markdown);
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
      expect(install.status).toBe(1);
      expect(install.stderr).toContain("Skill path contains a symlink");
      expect(() =>
        readFileSync(join(external, "skills/stack-effect/SKILL.md")),
      ).toThrow();
    } finally {
      rmSync(repository, { recursive: true, force: true });
      rmSync(external, { recursive: true, force: true });
    }
  });
});
