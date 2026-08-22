import { layer } from "@effect/vitest";
import {
  GenerationDomainAdapterId,
  GenerationDomainId,
  GenerationDomainOptionId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { CatalogService } from "./CatalogService";
import { alchemyRunContents } from "./registry/content/infrastructure";

describe("generation domain registry", () => {
  const generateAlchemySource = (projectName: string, targetName = "web") => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("client-react"),
      name: targetName,
    });
    return new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: projectName,
        runtime: { _tag: "bun" },
        infrastructure: "cloudflare",
      }),
      generationDomainAdapterId: GenerationDomainAdapterId.make(
        "cloudflare-website-vite",
      ),
    }).resolve(alchemyRunContents);
  };

  const generatedIdentities = (source: string) => ({
    stackName: source.match(/Alchemy\.Stack\(\n  "([^"]+)"/)?.[1],
    resourceId: source.match(/const resourceId = "([^"]+)"/)?.[1],
    targetId: source.match(/const targetId = "([^"]+)"/)?.[1],
    rootDir: source.match(/rootDir: "([^"]+)"/)?.[1],
  });

  const expectGeneratedSourceToParse = (source: string) => {
    const scriptBody = source
      .replaceAll(/^import .*;$/gm, "")
      .replace("export default", "return");
    expect(() => Function(scriptBody)).not.toThrow();
  };

  it("keeps all reproduced colliding project names distinct and repeatable", () => {
    const projectNames = ["acme$?(", "acme$\\+", "acme?)", "acme}+"];
    const identities = projectNames.map((projectName) =>
      generatedIdentities(generateAlchemySource(projectName)),
    );

    expect(
      projectNames.map((projectName) =>
        generatedIdentities(generateAlchemySource(projectName)),
      ),
    ).toEqual(identities);
    expect(new Set(identities.map(({ stackName }) => stackName)).size).toBe(4);
    expect(new Set(identities.map(({ resourceId }) => resourceId)).size).toBe(
      4,
    );
    for (const { stackName, resourceId } of identities) {
      expect(stackName).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(resourceId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("keeps sanitized-equivalent target names distinct without changing canonical paths", () => {
    const targetNames = ["web$?(", "web$\\+", "web?)", "web}+"];
    const identities = targetNames.map((targetName) =>
      generatedIdentities(generateAlchemySource("acme", targetName)),
    );

    expect(
      targetNames.map((targetName) =>
        generatedIdentities(generateAlchemySource("acme", targetName)),
      ),
    ).toEqual(identities);
    expect(new Set(identities.map(({ resourceId }) => resourceId)).size).toBe(
      4,
    );
    expect(identities.map(({ targetId }) => targetId)).toEqual(
      Array.from({ length: 4 }, () => "apps/client-react-web"),
    );
    expect(identities.map(({ rootDir }) => rootDir)).toEqual(
      Array.from({ length: 4 }, () => "apps/client-react-web"),
    );
    for (const { stackName, resourceId } of identities) {
      expect(stackName).toBe("acme");
      expect(resourceId).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("keeps provider identities distinct when accepted project names share a slug", () => {
    const first = generatedIdentities(generateAlchemySource("acme@$"));
    const second = generatedIdentities(generateAlchemySource("acme!%"));

    expect(first).toMatchObject({
      stackName: "se-encoded-acme-x61636d654024",
      resourceId:
        "se-encoded-acme-x61636d654024-cloudflare-website-vite-web-e3e1cb13",
    });
    expect(second).toMatchObject({
      stackName: "se-encoded-acme-x61636d652125",
      resourceId:
        "se-encoded-acme-x61636d652125-cloudflare-website-vite-web-e3e1cb13",
    });
    expect(first.stackName).not.toBe(second.stackName);
    expect(first.resourceId).not.toBe(second.resourceId);
  });

  it("keeps encoded, canonical, reserved, and whitespace identities distinct", () => {
    const projectNames = [
      "!",
      "se-encoded-project-x21",
      "project-x-21",
      "A",
      "a-x-41",
    ];
    const projectSources = projectNames.map((projectName) =>
      generateAlchemySource(projectName),
    );
    const projectIdentities = projectSources.map(generatedIdentities);

    expect(projectIdentities.map(({ stackName }) => stackName)).toEqual([
      "se-encoded-project-x21",
      "se-encoded-se-encoded-project-x-21-x73652d656e636f6465642d70726f6a6563742d783231",
      "project-x-21",
      "se-encoded-a-x41",
      "a-x-41",
    ]);
    expect(
      new Set(projectIdentities.map(({ stackName }) => stackName)),
    ).toHaveLength(projectNames.length);

    const targetNames = [
      "!",
      "project-x-21",
      "A",
      "a-x-41",
      "se-encoded-client-react-x21",
      "",
      " ",
      "\t",
    ];
    const targetSources = targetNames.map((targetName) =>
      generateAlchemySource("stack-effect", targetName),
    );
    const targetIdentities = targetSources.map(generatedIdentities);

    expect(
      new Set(targetIdentities.map(({ resourceId }) => resourceId)),
    ).toHaveLength(targetNames.length);
    expect(
      targetIdentities.slice(-3).map(({ targetId, rootDir }) => ({
        targetId,
        rootDir,
      })),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        targetId: "apps/client-react",
        rootDir: "apps/client-react",
      })),
    );
    expect(
      new Set(
        targetIdentities
          .slice(-3)
          .map(({ resourceId }) => resourceId?.slice(-8)),
      ),
    ).toHaveLength(1);

    for (const source of [...projectSources, ...targetSources]) {
      expectGeneratedSourceToParse(source);
    }
  });

  it("repeats identities and preserves canonical simple-name bytes", () => {
    const first = generatedIdentities(generateAlchemySource("catalog-built"));
    const repeated = generatedIdentities(
      generateAlchemySource("catalog-built"),
    );
    const stackEffect = generatedIdentities(
      generateAlchemySource("stack-effect"),
    );

    expect(first).toEqual(repeated);
    expect(first).toMatchObject({
      stackName: "catalog-built",
      resourceId: "catalog-built-cloudflare-website-vite-web-e0de8a05",
    });
    expect(stackEffect).toMatchObject({
      stackName: "stack-effect",
      resourceId: "stack-effect-cloudflare-website-vite-web-28b6f049",
    });
  });

  it("generates provider-safe Alchemy identifiers for accepted quoted names", () => {
    const identity = new TargetIdentity({
      kind: TargetKind.make("client-react"),
      name: 'Admin "UI"',
    });
    const source = new ContributionTokenContext({
      targetKey: identity.toKey(),
      identity,
      config: new StackConfig({
        name: 'Acme "Cloud"',
        runtime: { _tag: "bun" },
        infrastructure: "cloudflare",
      }),
      generationDomainAdapterId: GenerationDomainAdapterId.make(
        "cloudflare-website-vite",
      ),
    }).resolve(alchemyRunContents);

    expect(source).toContain('const targetId = "apps/client-react-admin-ui";');
    expect(source).toContain(
      'const resourceId = "se-encoded-acme-cloud-x41636d652022436c6f756422-cloudflare-website-vite-se-encoded-admin-ui-x41646d696e2022554922-',
    );
    expect(source).toContain('rootDir: "apps/client-react-admin-ui"');
    expect(source).toContain(
      'Alchemy.Stack(\n  "se-encoded-acme-cloud-x41636d652022436c6f756422",',
    );
    expectGeneratedSourceToParse(source);
    expect(source).not.toContain('Admin "UI"');
    expect(source).not.toContain('Acme "Cloud"');
  });

  layer(CatalogService.layer)("lookup", (it) => {
    it.effect(
      "looks up an option and exact target-kind adapter generically",
      () =>
        Effect.gen(function* () {
          const catalog = yield* CatalogService;
          const option = yield* catalog.getGenerationDomainOption(
            GenerationDomainId.make("infrastructure"),
            GenerationDomainOptionId.make("cloudflare"),
          );
          const adapter = yield* catalog.getGenerationDomainTargetAdapter(
            GenerationDomainId.make("infrastructure"),
            GenerationDomainOptionId.make("cloudflare"),
            TargetKind.make("client-react"),
          );
          expect(option).toMatchObject({
            minimumBindings: 1,
            maximumBindings: 1,
          });
          expect(adapter.adapterId).toBe("cloudflare-website-vite");
          expect(option.rootContributions).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                _tag: "pkg-json-entry",
                path: "package.json",
                field: "dependencies",
                name: "alchemy",
                value: "2.0.0-beta.73",
              }),
              expect.objectContaining({
                _tag: "pkg-json-entry",
                path: "package.json",
                field: "dependencies",
                name: "effect",
                value: "4.0.0-rc.111",
              }),
              expect.objectContaining({
                _tag: "pkg-json-entry",
                path: "package.json",
                field: "dependencies",
                name: "@effect/platform-node",
                value: "4.0.0-rc.111",
              }),
              expect.objectContaining({
                _tag: "pkg-json-entry",
                path: "package.json",
                field: "dependencies",
                name: "@effect/platform-bun",
                value: "4.0.0-rc.111",
              }),
              expect.objectContaining({
                _tag: "pkg-json-entry",
                field: "scripts",
                name: "infra:deploy",
                value: "alchemy deploy",
              }),
            ]),
          );
          const entries = option.rootContributions.filter(
            (contribution) => contribution._tag === "pkg-json-entry",
          );
          expect(
            entries
              .filter((entry) => entry.field === "scripts")
              .map(({ name, value }) => [name, value]),
          ).toEqual([
            ["infra:plan", "alchemy plan"],
            ["infra:dev", "alchemy dev"],
            ["infra:deploy", "alchemy deploy"],
            ["infra:destroy", "alchemy destroy"],
          ]);
          expect(entries.some((entry) => entry.name === "dev")).toBe(false);
          expect(option.nextSteps).toEqual([
            "Run infra:dev for credential-free local Alchemy startup; it must not contact Cloudflare.",
            "Before infra:plan, infra:deploy, or infra:destroy, supply credentials through Alchemy and Cloudflare's documented external configuration.",
            "Those remote commands may inspect, create, mutate, or delete real provider state and are not covered by local acceptance.",
            "Local acceptance does not prove workers.dev, edge upload, TLS, global routing, provider authentication, or remote destroy.",
            "Never place secrets in generated source or public Vite configuration.",
          ]);
          expect(adapter.contributions).toHaveLength(1);
          const stackContribution = adapter.contributions[0];
          expect(stackContribution).toMatchObject({
            _tag: "file",
            path: "alchemy.run.ts",
          });
          expect(stackContribution?._tag).toBe("file");
          if (stackContribution?._tag !== "file") return;
          expect(stackContribution.contents).toContain(
            'rootDir: "{{targetPath}}"',
          );
          expect(stackContribution.contents).toContain(
            'notFoundHandling: "single-page-application"',
          );
          expect(stackContribution.contents).toContain(
            "state: Alchemy.localState()",
          );
          expect(stackContribution.contents).not.toContain(
            "Cloudflare.state()",
          );
          expect(stackContribution.contents).toContain("yield* Alchemy.Stage");
          expect(stackContribution.contents).toContain("url: website.url");
          expect(stackContribution.contents).toContain("urls: website.urls");
          expect(
            stackContribution.contents.match(/Alchemy\.Stack\(/g),
          ).toHaveLength(1);
          expect(
            stackContribution.contents.match(/Cloudflare\.Website\.Vite\(/g),
          ).toHaveLength(1);
        }),
    );
  });
});
