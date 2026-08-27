import { ApplyFailure } from "@repo/domain/Apply";
import type { YamlSequenceEntryOp } from "@repo/domain/Plan";
import { Context, Effect, Layer } from "effect";

export class YamlComposer extends Context.Service<YamlComposer>()(
  "YamlComposer",
  {
    make: Effect.succeed({
      compose: (
        contents: string,
        operations: ReadonlyArray<typeof YamlSequenceEntryOp.Type>,
      ) =>
        Effect.gen(function* () {
          if (contents.length === 0) {
            const values = operations
              .map((operation) => operation.value)
              .filter((value, index, all) => all.indexOf(value) === index);
            if (values.length === 0) return contents;
            return `packages:\n${values.map((value) => `  - "${value}"\n`).join("")}`;
          }

          const lines =
            contents.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter(Boolean) ?? [];
          const body = (line: string) => line.replace(/(?:\r\n|\n|\r)$/, "");
          const packagesIndex = lines.findIndex((line) =>
            /^packages:\s*(?:#.*)?$/.test(body(line)),
          );
          const sectionEnd = lines.findIndex(
            (line, index) =>
              index > packagesIndex && /^(?!\s|#|$)[^:]+:/.test(body(line)),
          );
          const packageLines = lines.slice(
            packagesIndex + 1,
            sectionEnd === -1 ? lines.length : sectionEnd,
          );
          const sequenceLines = packageLines.filter((line) =>
            /^\s+-\s+.+$/.test(body(line)),
          );
          const malformed = packageLines.some((line) => {
            const text = body(line);
            return (
              text.trim().length > 0 &&
              !/^\s*#/.test(text) &&
              !/^\s+-\s+.+$/.test(text)
            );
          });

          if (packagesIndex === -1 || sequenceLines.length === 0 || malformed)
            return yield* new ApplyFailure({
              reason: "repoRootInvalid",
              message:
                "Could not parse pnpm-workspace.yaml during apply: expected a packages sequence.",
            });

          const values = sequenceLines.map((line) =>
            body(line)
              .replace(/^\s+-\s+/, "")
              .replace(/\s+#.*$/, "")
              .trim()
              .replace(/^(['\"])(.*)\1$/, "$2"),
          );
          const additions = operations
            .map((operation) => operation.value)
            .filter(
              (value, index, all) =>
                !values.includes(value) && all.indexOf(value) === index,
            );
          if (additions.length === 0) return contents;

          const lastSequenceIndex = lines.lastIndexOf(sequenceLines.at(-1)!);
          const insertionOffset = lines
            .slice(0, lastSequenceIndex + 1)
            .join("").length;
          const newline = contents.includes("\r\n") ? "\r\n" : "\n";
          const leadingNewline = /(?:\r\n|\n|\r)$/.test(
            lines[lastSequenceIndex]!,
          )
            ? ""
            : newline;
          const insertion = `${leadingNewline}${additions
            .map((value) => `  - "${value}"${newline}`)
            .join("")}`;

          return `${contents.slice(0, insertionOffset)}${insertion}${contents.slice(insertionOffset)}`;
        }),
    }),
  },
) {
  static readonly layer = Layer.effect(YamlComposer)(YamlComposer.make);
}
