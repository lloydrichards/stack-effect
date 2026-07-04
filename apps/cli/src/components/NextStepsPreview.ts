import { Panel } from "@repo/tui";
import { Ansi, Box, Container, Flex } from "effect-boxes";

const sectionTitle = (title: string) =>
  Box.text(title).pipe(Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)));

export const NextStepsPreview = ({
  conflicts,
  skippedScripts,
  steps,
}: {
  conflicts: ReadonlyArray<string>;
  skippedScripts: ReadonlyArray<{ label: string; command: string }>;
  steps: ReadonlyArray<string>;
}): Box.Box<Ansi.AnsiStyle> => {
  const sections: Box.Box<Ansi.AnsiStyle>[] = [];

  if (conflicts.length > 0) {
    const items = conflicts.map((path) =>
      Flex.row(
        [
          Flex.fixed(Box.text("\u2022").pipe(Box.annotate(Ansi.yellow))),
          Flex.fixed(Box.text(path)),
        ],
        80,
        { gap: 1 },
      ),
    );
    sections.push(
      Box.vsep(
        [sectionTitle("Manual Resolution Needed"), ...items],
        0,
        Box.left,
      ),
    );
  }

  if (skippedScripts.length > 0) {
    const items = skippedScripts.map((s) =>
      Flex.row(
        [
          Flex.fixed(Box.text("\u2022").pipe(Box.annotate(Ansi.yellow))),
          Flex.fixed(Box.text(s.command).pipe(Box.annotate(Ansi.dim))),
        ],
        80,
        { gap: 1 },
      ),
    );
    sections.push(
      Box.vsep([sectionTitle("Skipped Scripts"), ...items], 0, Box.left),
    );
  }

  if (steps.length > 0) {
    const items = steps.map((step, i) =>
      Flex.row(
        [
          Flex.fixed(Box.text(`${i + 1}.`).pipe(Box.annotate(Ansi.cyan))),
          Flex.fixed(Box.text(step)),
        ],
        80,
        { gap: 1 },
      ),
    );
    sections.push(
      Box.vsep([sectionTitle("Next Steps"), ...items], 0, Box.left),
    );
  }

  if (sections.length === 0) {
    return Box.text("");
  }

  const terminalWidth = process.stdout.columns ?? 80;

  return Container.make({ width: terminalWidth, padding: [0, 2] }, (ctx) => {
    const panels = sections.map((section, i) => {
      const isFirst = i === 0;
      const isLast = i === sections.length - 1;
      return section.pipe(
        Box.minWidth(ctx.innerWidth),
        Panel.make({
          padding: Box.pad(0, 1),
          border: Box.border("rounded", {
            annotation: Ansi.dim,
            sides: { top: isFirst, bottom: isLast },
          }),
        }),
      );
    });

    const footer = Box.text(
      "Add modules with 'stack-effect add' or explore available options with 'stack-effect graph'",
    ).pipe(Box.annotate(Ansi.dim));

    return Box.vsep([Box.vcat(panels, Box.left), footer], 1, Box.left).pipe(
      Box.moveDown(1),
    );
  });
};
