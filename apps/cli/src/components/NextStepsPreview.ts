import { Ansi, Box } from "effect-boxes";

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

  // Conflicts section
  if (conflicts.length > 0) {
    const items = conflicts.map((path) =>
      Box.hsep(
        [Box.text("\u2022").pipe(Box.annotate(Ansi.yellow)), Box.text(path)],
        1,
        Box.left,
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

  // Skipped scripts section
  if (skippedScripts.length > 0) {
    const items = skippedScripts.map((s) =>
      Box.hsep(
        [
          Box.text("\u2022").pipe(Box.annotate(Ansi.yellow)),
          Box.text(s.command).pipe(Box.annotate(Ansi.dim)),
        ],
        1,
        Box.left,
      ),
    );
    sections.push(
      Box.vsep([sectionTitle("Skipped Scripts"), ...items], 0, Box.left),
    );
  }

  // Next steps section
  if (steps.length > 0) {
    const items = steps.map((step, i) =>
      Box.hsep(
        [Box.text(`${i + 1}.`).pipe(Box.annotate(Ansi.cyan)), Box.text(step)],
        1,
        Box.left,
      ),
    );
    sections.push(
      Box.vsep([sectionTitle("Next Steps"), ...items], 0, Box.left),
    );
  }

  if (sections.length === 0) {
    return Box.text("");
  }

  // Stack sections vertically with borders
  const terminalWidth = process.stdout.columns ?? 80;
  const contentWidth = terminalWidth - 4;

  const panels = sections.map((section, i) => {
    const isFirst = i === 0;
    const isLast = i === sections.length - 1;
    return section.pipe(
      Box.minWidth(contentWidth),
      Box.pad(0, 1),
      Box.border("rounded", {
        annotation: Ansi.dim,
        sides: { top: isFirst, bottom: isLast },
      }),
    );
  });

  const footer = Box.text(
    "Add modules with 'stack-effect add' or explore available options with 'stack-effect graph'",
  ).pipe(Box.annotate(Ansi.dim));

  return Box.vsep([Box.vcat(panels, Box.left), footer], 1, Box.left).pipe(
    Box.moveDown(1),
  );
};
