import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import pkg from "../../package.json";
import { stackEffectCommand } from "../command";
import { StackEffectServicesLayer } from "../services";
import { collectCliReference, validateCliReference } from "./CliReference";
import { renderCliReferencePages } from "./CliReferenceMarkdown";

const TestLayer = StackEffectServicesLayer.pipe(
  Layer.provideMerge(NodeServices.layer),
);

describe("CLI reference", () => {
  it.effect("collects the visible command tree from Effect help metadata", () =>
    Effect.gen(function* () {
      const reference = yield* collectCliReference(
        stackEffectCommand,
        pkg.version,
      );

      expect(reference.version).toBe(pkg.version);
      expect(
        reference.commands.map((command) => command.path.join(" ")),
      ).toEqual([
        "stack-effect",
        "stack-effect init",
        "stack-effect create",
        "stack-effect add",
        "stack-effect graph",
        "stack-effect plan",
        "stack-effect schema",
        "stack-effect catalog",
        "stack-effect catalog workspace",
        "stack-effect catalog workspace reset",
        "stack-effect catalog workspace diff",
        "stack-effect catalog workspace validate",
      ]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("validates the collected command metadata", () =>
    Effect.gen(function* () {
      const reference = yield* collectCliReference(
        stackEffectCommand,
        pkg.version,
      );

      expect(validateCliReference(reference)).toEqual([]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("renders command pages from the collected metadata", () =>
    Effect.gen(function* () {
      const reference = yield* collectCliReference(
        stackEffectCommand,
        pkg.version,
      );
      const pages = renderCliReferencePages(reference);
      expect(pages.map((page) => page.slug)).toEqual([
        "index",
        "init",
        "create",
        "add",
        "graph",
        "plan",
        "schema",
        "catalog",
      ]);
      expect(pages.find((page) => page.slug === "add")?.content).toContain(
        "# stack-effect add",
      );
      expect(pages.find((page) => page.slug === "add")?.content).not.toContain(
        "## Global options",
      );
      expect(pages.find((page) => page.slug === "index")?.content).toContain(
        "## Global options",
      );
      expect(pages.find((page) => page.slug === "catalog")?.content).toContain(
        "## stack-effect catalog workspace validate",
      );
    }).pipe(Effect.provide(TestLayer)),
  );
});
