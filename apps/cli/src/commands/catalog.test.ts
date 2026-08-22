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
import { describe, expect, it } from "vitest";
import { buildManifestFiles } from "./catalog";

const targetKey = TargetKey.make("apps/client-react-web");
const domainId = GenerationDomainId.make("infrastructure");
const optionId = GenerationDomainOptionId.make("cloudflare");
const adapterId = GenerationDomainAdapterId.make("cloudflare-website-vite");

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
