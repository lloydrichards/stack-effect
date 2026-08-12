import { describe, expect, it } from "@effect/vitest";
import type { TypeScriptCompositionOperation } from "@repo/domain/Plan";
import { Effect } from "effect";
import { TypeScriptComposer } from "./TypeScriptComposer";

const compose = (
  contents: string,
  operations: ReadonlyArray<TypeScriptCompositionOperation>,
) =>
  Effect.gen(function* () {
    const composer = yield* TypeScriptComposer;
    return yield* composer.compose(contents, operations);
  }).pipe(Effect.provide(TypeScriptComposer.layer));

const jsxSlot = (slotId: string, content: string) =>
  ({
    _tag: "ts-jsx-slot",
    fileType: "typescript",
    slotId,
    content,
  }) as const;

describe("TypeScriptComposer JSX slots", () => {
  it.effect("fails when the requested marker is absent", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        compose("export const App = () => <main />;", [
          jsxSlot("components", "<Card />"),
        ]),
      );

      expect(failure).toMatchObject({
        _tag: "ApplyFailure",
        reason: "repoRootInvalid",
        message:
          "Could not find JSX slot {/* @slot:components */} during TypeScript composition.",
      });
    }),
  );

  it.effect("preserves contribution order and is idempotent", () =>
    Effect.gen(function* () {
      const input = `export const App = () => (\n  <main>\n    {/* @slot:components */}\n  </main>\n);\n`;
      const operations = [
        jsxSlot("components", "<Alpha />"),
        {
          _tag: "ts-add-import",
          fileType: "typescript",
          moduleSpecifier: "./cards",
          namedImports: ["Alpha", "Beta"],
        } as const,
        jsxSlot("components", "<Beta />"),
      ];

      const once = yield* compose(input, operations);
      const twice = yield* compose(once, operations);

      expect(once.indexOf("<Alpha />")).toBeLessThan(once.indexOf("<Beta />"));
      expect(twice).toBe(once);
      expect(twice.match(/<Alpha \/>/g)).toHaveLength(1);
      expect(twice.match(/<Beta \/>/g)).toHaveLength(1);
      expect(twice.match(/from "\.\/cards"/g)).toHaveLength(1);
    }),
  );

  it.effect(
    "does not treat matching content outside the slot as inserted",
    () =>
      Effect.gen(function* () {
        const input = `export const App = () => (\n  <>\n    <main>\n      {/* @slot:components */}\n    </main>\n    <aside><Card /></aside>\n  </>\n);\n`;

        const output = yield* compose(input, [
          jsxSlot("components", "<Card />"),
        ]);

        expect(output.match(/<Card \/>/g)).toHaveLength(2);
      }),
  );

  it.effect("bounds duplicate detection at the next sibling slot", () =>
    Effect.gen(function* () {
      const input = `export const App = () => (
  <main>
    {/* @slot:first */}
    {/* @slot:second */}
    <Card />
  </main>
);
`;

      const output = yield* compose(input, [jsxSlot("first", "<Card />")]);

      expect(output.match(/<Card \/>/g)).toHaveLength(2);
      expect(output.indexOf("<Card />")).toBeLessThan(
        output.indexOf("{/* @slot:second */}"),
      );
    }),
  );

  it.effect("is idempotent when the slot belongs to a JSX fragment", () =>
    Effect.gen(function* () {
      const input = `export const App = () => (
  <>
    {/* @slot:components */}
  </>
);
`;
      const operations = [jsxSlot("components", "<Card />")];

      const once = yield* compose(input, operations);
      const twice = yield* compose(once, operations);

      expect(twice).toBe(once);
      expect(twice.match(/<Card \/>/g)).toHaveLength(1);
    }),
  );
});
