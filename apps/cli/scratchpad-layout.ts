/**
 * Layout Scratchpad — annotated demos of each layout helper.
 *
 * Run with: bun apps/cli/scratchpad-layout.ts
 */
import { BunServices } from "@effect/platform-bun";
import { Console, Effect, Terminal } from "effect";
import * as Ansi from "effect-boxes/Ansi";
import * as Box from "effect-boxes/Box";
import { Panel } from "./src/components/Panel";
import { Breakpoint, Container, Flex, Grid } from "./src/lib/Layout";

const title = (text: string) =>
  Box.text(text).pipe(Box.annotate(Ansi.combine(Ansi.bold, Ansi.white)));

const label = (text: string) => Box.text(text).pipe(Box.annotate(Ansi.cyan));

const desc = (text: string) => Box.text(text).pipe(Box.annotate(Ansi.dim));

const sectionTitle = (name: string) =>
  Box.text(` ${name} `).pipe(
    Box.annotate(
      Ansi.combine(Ansi.bold, Ansi.bgColorRGB(60, 60, 120), Ansi.white),
    ),
  );

const propNote = (prop: string, explanation: string) =>
  Box.hsep(
    [Box.text(prop).pipe(Box.annotate(Ansi.yellow)), desc(explanation)],
    1,
    Box.left,
  );

const flexDemo = (termWidth: number) =>
  Container.make({ width: termWidth - 4, padding: 0 }, (ctx) => {
    return Box.vcat(
      [
        sectionTitle("Flex.row / Flex.col"),
        desc(
          "Distribute space among fixed and grow children within a container.",
        ),
        Box.emptyBox(1, 1),
        propNote("Flex.fixed(box)", "child keeps its intrinsic width"),
        propNote(
          "Flex.grow(box, factor?)",
          "child expands (space allocated, content unchanged)",
        ),
        propNote(
          "Flex.fill((w) => box, factor?)",
          "builder receives allocated width — content fills exactly",
        ),
        propNote("gap", "spacing between children"),
        Box.emptyBox(1, 1),
        label(`Flex.row(${ctx.width}, [fixed, fill(1), fixed])`),
        Flex.row(
          ctx.width,
          [
            Flex.fixed(
              Panel.make(Box.text("FIXED").pipe(Box.minHeight(2)), {
                border: Box.border("single"),
                padding: Box.pad(0, 1),
              }),
            ),
            Flex.fill((w) =>
              Panel.make(
                Box.text("FILL (factor=1)").pipe(
                  Box.minHeight(2),
                  Box.minWidth(w - 4),
                ),
                { border: Box.border("double"), padding: Box.pad(0, 1) },
              ),
            ),
            Flex.fixed(
              Panel.make(Box.text("FIXED").pipe(Box.minHeight(2)), {
                border: Box.border("single"),
                padding: Box.pad(0, 1),
              }),
            ),
          ],
          { gap: 1 },
        ),
        Box.emptyBox(1, 1),
        label(`Flex.row(${ctx.width}, [fill(1), fill(2)]) — proportional`),
        Flex.row(
          ctx.width,
          [
            Flex.fill(
              (w) =>
                Panel.make(Box.text("1/3 width").pipe(Box.minWidth(w - 4)), {
                  border: Box.border("rounded"),
                  padding: Box.pad(0, 1),
                }),
              1,
            ),
            Flex.fill(
              (w) =>
                Panel.make(Box.text("2/3 width").pipe(Box.minWidth(w - 4)), {
                  border: Box.border("rounded"),
                  padding: Box.pad(0, 1),
                }),
              2,
            ),
          ],
          { gap: 1 },
        ),
      ],
      Box.top,
    );
  });

const gridLabels = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta"];

const gridDemo = (termWidth: number) =>
  Container.make({ width: termWidth - 4, padding: 0 }, (ctx) => {
    const makeGridItems = (colWidth: number) =>
      gridLabels.map((name) =>
        Panel.make(Box.text(name).pipe(Box.minWidth(colWidth - 4)), {
          border: Box.border("single"),
          padding: Box.pad(0, 1),
        }),
      );

    return Box.vcat(
      [
        sectionTitle("Grid.make / Grid.auto"),
        desc("Arrange items in rows of N columns with fixed cell width."),
        Box.emptyBox(1, 1),
        propNote("cols", "number of columns per row"),
        propNote("colWidth", "fixed character width per cell"),
        propNote("gap: [h, v]", "horizontal and vertical gap between cells"),
        propNote(
          "Grid.auto(width, items, { minColWidth })",
          "auto-calculate cols from container",
        ),
        propNote("stretch", "expand items to fill cell width (default false)"),
        Box.emptyBox(1, 1),
        label("Grid.make(items, { cols: 3, colWidth: 20, gap: [1, 1] })"),
        Grid.make(makeGridItems(20), {
          cols: 3,
          colWidth: 20,
          gap: [1, 1],
        }).pipe(Box.border("rounded")),
        Box.emptyBox(1, 1),
        label(`Grid.auto(${ctx.width}, items, { minColWidth: 14, gap: 1 })`),
        desc(
          "  Columns auto-calculated from available width. Capped at item count.",
        ),
        (() => {
          const gap = 1;
          const cols = Math.min(
            gridLabels.length,
            Math.max(1, Math.floor((ctx.width + gap) / (14 + gap))),
          );
          const colWidth = Math.floor((ctx.width - (cols - 1) * gap) / cols);
          return Grid.make(makeGridItems(colWidth), {
            cols,
            colWidth,
            gap: [gap, 0],
          });
        })().pipe(Box.border("rounded")),
      ],
      Box.top,
    );
  });

const panelDemo = Box.vcat(
  [
    sectionTitle("Panel.make"),
    desc("Bordered + padded section. Extracts the most common Box pattern."),
    Box.emptyBox(1, 1),
    propNote("border", "BoxOperator — e.g. Box.border('rounded')"),
    propNote("padding", "BoxOperator — e.g. Box.pad(0, 1)"),
    propNote("margin", "BoxOperator — e.g. Box.pad(1)"),
    Box.emptyBox(1, 1),
    Box.hsep(
      [
        Panel.make(Box.text("rounded\npad: [0,1]"), {
          border: Box.border("rounded"),
          padding: Box.pad(0, 1),
        }),
        Panel.make(Box.text("single\npad: 1"), {
          border: Box.border("single"),
          padding: Box.pad(1),
        }),
        Panel.make(Box.text("double\npad: [0,2]"), {
          border: Box.border("double"),
          padding: Box.pad(0, 2),
        }),
        Panel.make(Box.text("thick\nno pad"), { border: Box.border("thick") }),
      ],
      1,
      Box.center1,
    ),
    Box.emptyBox(1, 1),
    label("Partial borders: sides: { left: true, others: false }"),
    Panel.make(Box.text("left border only"), {
      border: Box.border("rounded", {
        sides: { top: false, right: false, bottom: false, left: true },
      }),
      padding: Box.pad(0, 1),
    }),
  ],
  Box.top,
);

const breakpointDemo = (termWidth: number) =>
  Container.make({ width: termWidth - 4, padding: 0 }, (ctx) => {
    const current = Breakpoint.select(ctx.width, [
      { minWidth: 100, render: () => Box.text("WIDE layout (>=100 cols)") },
      { minWidth: 60, render: () => Box.text("MEDIUM layout (>=60 cols)") },
      { minWidth: 0, render: () => Box.text("NARROW layout (<60 cols)") },
    ]);

    return Box.vcat(
      [
        sectionTitle("Breakpoint.select"),
        desc(
          "Switch layout based on container width. Largest matching minWidth wins.",
        ),
        Box.emptyBox(1, 1),
        propNote("minWidth", "minimum container width to activate this layout"),
        propNote("render", "() => Box — lazy builder for this breakpoint"),
        Box.emptyBox(1, 1),
        label(`Container width: ${ctx.width} cols`),
        label("Breakpoints: [100, 60, 0]"),
        desc("Active:"),
        current.pipe(
          Box.pad(0, 1),
          Box.annotate(Ansi.combine(Ansi.bgColorRGB(40, 80, 40), Ansi.white)),
        ),
      ],
      Box.top,
    );
  });

const containerDemo = (termWidth: number) =>
  Container.make({ width: termWidth - 4, padding: 0 }, (ctx) =>
    Box.vcat(
      [
        sectionTitle("Container.make"),
        desc(
          "Provides container context (width, height, innerWidth) to a builder fn.",
        ),
        Box.emptyBox(1, 1),
        propNote("width", "total container width"),
        propNote("padding", "number or [y, x] — subtracted to get innerWidth"),
        propNote("ctx.innerWidth", "usable width after padding"),
        Box.emptyBox(1, 1),
        label(
          `Container.make({ width: ${termWidth - 4}, padding: 2 }, (ctx) => ...)`,
        ),
        Container.make({ width: ctx.width, padding: 2 }, (inner) =>
          Box.vcat(
            [
              desc(`  ctx.width = ${inner.width}`),
              desc(`  ctx.innerWidth = ${inner.innerWidth}`),
              Panel.make(
                Box.text(`content area: ${inner.innerWidth} cols`).pipe(
                  Box.minWidth(inner.innerWidth - 4),
                ),
                { border: Box.border("rounded"), padding: Box.pad(0, 1) },
              ),
            ],
            Box.top,
          ),
        ).pipe(Box.border("single")),
      ],
      Box.top,
    ),
  );

const main = Effect.gen(function* () {
  const terminal = yield* Terminal.Terminal;
  const termWidth = yield* terminal.columns;

  const divider = Box.text("─".repeat(termWidth - 4)).pipe(
    Box.annotate(Ansi.dim),
  );

  const layout = Box.vsep(
    [
      Box.emptyBox(1, 1),
      title("Layout Helpers — Interactive Reference"),
      desc(`Terminal: ${termWidth} cols`),
      divider,
      flexDemo(termWidth),
      divider,
      gridDemo(termWidth),
      divider,
      panelDemo,
      divider,
      breakpointDemo(termWidth),
      divider,
      containerDemo(termWidth),
      divider,
      Box.emptyBox(1, 1),
    ],
    1,
    Box.top,
  ).pipe(Box.pad(0, 1));

  yield* Console.log(Box.renderPrettySync(layout));
});

void Effect.runPromise(main.pipe(Effect.provide(BunServices.layer))).catch(
  (error) => {
    console.error("Error in Layout Scratchpad:", error);
  },
);
