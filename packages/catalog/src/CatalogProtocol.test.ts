import { assert, describe, it } from "@effect/vitest";
import {
  CatalogDocument,
  TargetIdentity,
  TargetKind,
  TargetKey,
} from "@repo/domain/Catalog";
import { ContributionTokenContext, StackConfig } from "@repo/domain/Scaffold";
import { Array as Arr, Effect, Schema } from "effect";
import {
  decodeCatalogDocument,
  validateCatalogCapabilities,
} from "./CatalogProtocol";
import { composeCatalog } from "./composeCatalog";
import {
  decodedTestCatalog,
  exportTestCatalog,
  testCatalog,
  withModuleContribution,
} from "./testCatalog";

const extraFile = (contents: string) =>
  ({ _tag: "file", path: "extra.txt", contents }) as const;

const tokenContext = new ContributionTokenContext({
  targetKey: TargetKey.make("apps/server-api"),
  identity: new TargetIdentity({
    kind: TargetKind.make("server"),
    name: "api",
  }),
  config: new StackConfig({
    name: Schema.NonEmptyString.make("my-project"),
    runtime: { _tag: "bun" },
  }),
});

describe("CatalogProtocol", () => {
  it.effect(
    "should round-trip every definition with TargetIdentity behavior when the catalog is exported and decoded",
    () =>
      Effect.gen(function* () {
        const json = yield* exportTestCatalog();
        const document = yield* Schema.decodeEffect(
          Schema.fromJsonString(CatalogDocument),
        )(json);
        assert.strictEqual(document.formatVersion, 1);
        assert.strictEqual(document.targets.length, testCatalog.targets.length);
        assert.strictEqual(document.modules.length, testCatalog.modules.length);
        const dependency = document.modules
          .flatMap((module) => module.dependencies)
          .find((item) => item._tag === "required-module");
        assert.isDefined(dependency);
        assert.strictEqual(dependency._tag, "required-module");
        assert.instanceOf(dependency.target, TargetIdentity);
        assert.isTrue(dependency.target.toKey().length > 0);
        const encoded = yield* Schema.encodeEffect(
          Schema.fromJsonString(CatalogDocument),
        )(document);
        assert.strictEqual(encoded, json.trim());
      }),
  );

  it.effect(
    "should refuse the document when it requires an interpreter capability outside the fixed v1 set",
    () =>
      Effect.gen(function* () {
        const document = yield* decodedTestCatalog;
        const failure = yield* Effect.flip(
          validateCatalogCapabilities({
            ...document,
            requiredCapabilities: [
              ...document.requiredCapabilities,
              "token:unknown",
            ],
          }),
        );
        assert.include(failure.capabilities, "token:unknown");
        assert.deepStrictEqual(
          failure.details.find((issue) => issue.capability === "token:unknown")
            ?.subject,
          { _tag: "document" },
        );
      }),
  );

  it.effect(
    "should refuse a new template token and attribute it to its module when metadata omits it",
    () =>
      Effect.gen(function* () {
        const document = yield* decodedTestCatalog;
        const first = document.modules[0];
        assert.isDefined(first);
        const failure = yield* Effect.flip(
          validateCatalogCapabilities(
            withModuleContribution(document, [extraFile("{{unknown}}")]),
          ),
        );
        assert.include(failure.capabilities, "token:unknown");
        assert.deepStrictEqual(
          failure.details.filter(
            (issue) => issue.capability === "token:unknown",
          ),
          [
            {
              subject: { _tag: "module", id: first.id },
              capability: "token:unknown",
            },
          ],
        );
      }),
  );

  it.effect.each([
    "{{ runtime }}",
    "{{#if runtime =bun}}bun{{/if}}",
    "{{#if runtime=bun}}bun",
    "bun{{/if}}",
    "{{#if runtime=bun}}{{#if lint}}nested{{/if}}{{/if}}",
  ])(
    "should refuse the template when the renderer leaves %s unresolved",
    (contents) =>
      Effect.gen(function* () {
        assert.match(tokenContext.resolve(contents), /\{\{/);
        const document = yield* decodedTestCatalog;
        const failure = yield* Effect.flip(
          validateCatalogCapabilities(
            withModuleContribution(document, [extraFile(contents)]),
          ),
        );
        assert.isAbove(failure.capabilities.length, 0);
      }),
  );

  it.effect(
    "should report a malformed template when conditional delimiters are split across file contributions",
    () =>
      Effect.gen(function* () {
        const document = yield* decodedTestCatalog;
        const failure = yield* Effect.flip(
          validateCatalogCapabilities(
            withModuleContribution(document, [
              {
                _tag: "file",
                path: "open.txt",
                contents: "{{#if runtime=bun}}",
              },
              { _tag: "file", path: "close.txt", contents: "{{/if}}" },
            ]),
          ),
        );
        assert.include(failure.capabilities, "syntax:malformed-template");
      }),
  );

  it.effect(
    "should decode a source and fail composition with missing-reference when its cross-source references are absent",
    () =>
      Effect.gen(function* () {
        const official = yield* decodedTestCatalog;
        const module = official.modules.find((item) =>
          item.dependencies.some(
            (dependency) => dependency._tag === "required-module",
          ),
        );
        assert.isDefined(module);
        const encoded = yield* Schema.encodeEffect(CatalogDocument)({
          ...official,
          targets: [],
          modules: [module],
        });
        const fragment = yield* decodeCatalogDocument(encoded);
        assert.strictEqual(fragment.modules.length, 1);
        const error = yield* Effect.flip(composeCatalog([fragment]));
        assert.deepStrictEqual(
          Arr.dedupe(error.details.map((issue) => issue.code)),
          ["missing-reference"],
        );
      }),
  );

  it.effect(
    "should keep the capability message and attribute target usage when a target uses an undeclared token",
    () =>
      Effect.gen(function* () {
        const document = yield* decodedTestCatalog;
        const [target, ...targets] = document.targets;
        assert.isDefined(target);
        const failure = yield* Effect.flip(
          validateCatalogCapabilities({
            ...document,
            requiredCapabilities: [
              ...document.requiredCapabilities,
              "token:declaredOnly",
            ],
            targets: [
              {
                ...target,
                contributions: [
                  ...target.contributions,
                  { _tag: "file", path: "used.txt", contents: "{{usedOnly}}" },
                ],
              },
              ...targets,
            ],
          }),
        );
        assert.strictEqual(
          failure.message,
          "Catalog requires unsupported or undeclared interpreter capabilities: token:declaredOnly, token:usedOnly",
        );
        assert.deepStrictEqual(failure.details, [
          { subject: { _tag: "document" }, capability: "token:declaredOnly" },
          {
            subject: { _tag: "target", kind: target.kind },
            capability: "token:usedOnly",
          },
        ]);
      }),
  );
});
