import {
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  Contribution,
  GenerationDomainAdapterId,
  GenerationDomainId,
  GenerationDomainOptionId,
  TargetKey,
} from "@repo/domain/Catalog";
import {
  NormalizedContributions,
  TargetContribution,
} from "@repo/domain/Scaffold";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { buildManifestFiles, ensureWorkspaceLink } from "./catalog";

const targetKey = TargetKey.make("apps/client-react-web");
const domainId = GenerationDomainId.make("infrastructure");
const optionId = GenerationDomainOptionId.make("cloudflare");
const adapterId = GenerationDomainAdapterId.make("cloudflare-website-vite");

describe("catalog workspace links", () => {
  it("is idempotent for correct links and rejects conflicts", async () => {
    const root = await mkdtemp(join(tmpdir(), "catalog-links-"));
    const source = join(root, "source");
    const target = join(root, "target");
    try {
      await mkdir(source);
      await symlink(source, target, "dir");
      await Effect.runPromise(ensureWorkspaceLink(source, target, "ai"));
      expect(resolve(root, await readlink(target))).toBe(source);

      const missing = join(root, "missing");
      await Effect.runPromise(ensureWorkspaceLink(source, missing, "domain"));
      expect(resolve(root, await readlink(missing))).toBe(source);

      const conflict = join(root, "conflict");
      await writeFile(conflict, "not a link");
      await expect(
        Effect.runPromise(ensureWorkspaceLink(source, conflict, "bad")),
      ).rejects.toThrow("link @repo/bad");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("catalog workspace manifest", () => {
  it("preserves generation-domain option and adapter provenance", () => {
    const files = buildManifestFiles(
      NormalizedContributions.make({
        targets: [
          TargetContribution.make({
            targetKey,
            contributions: [
              Contribution.cases.file.make({
                path: "base.ts",
                contents: "base",
              }),
            ],
          }),
          TargetContribution.make({
            targetKey,
            generationDomain: { domainId, optionId },
            contributions: [
              Contribution.cases["pkg-json-entry"].make({
                path: "package.json",
                field: "dependencies",
                name: "alchemy",
                value: "2.0.0-beta.73",
              }),
            ],
          }),
          TargetContribution.make({
            targetKey,
            generationDomain: { domainId, optionId, adapterId },
            contributions: [
              Contribution.cases.file.make({
                path: "alchemy.run.ts",
                contents: "export default {};",
              }),
            ],
          }),
        ],
        modules: [],
      }),
    );

    expect(files).toEqual([
      {
        path: "alchemy.run.ts",
        contributors: [
          {
            origin: "generation-domain",
            targetKey: "apps/client-react-web",
            domainId: "infrastructure",
            optionId: "cloudflare",
            adapterId: "cloudflare-website-vite",
            contributionTag: "file",
          },
        ],
      },
      {
        path: "base.ts",
        contributors: [
          {
            origin: "target",
            targetKey: "apps/client-react-web",
            contributionTag: "file",
          },
        ],
      },
      {
        path: "package.json",
        contributors: [
          {
            origin: "generation-domain",
            targetKey: "apps/client-react-web",
            domainId: "infrastructure",
            optionId: "cloudflare",
            contributionTag: "pkg-json-entry",
          },
        ],
      },
    ]);
  });
});
