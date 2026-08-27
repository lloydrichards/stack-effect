import type { ApplyResult } from "@repo/domain/Apply";
import type { ApplyPreviewFile } from "@repo/scaffold";
import { Breakpoint, Panel } from "@repo/tui";
import { Array as Arr, String as Str } from "effect";
import { Ansi, Box, Container, Flex } from "effect-boxes";

const sectionTitle = (title: string) =>
  Box.text(title).pipe(Box.annotate(Ansi.combine(Ansi.bold, Ansi.cyan)));

const wrapFileContents = (contents: string, width: number) =>
  Arr.flatMap(Str.split(contents, "\n"), (line) =>
    line.length === 0
      ? [""]
      : Arr.makeBy(Math.ceil(line.length / width), (index) =>
          line.slice(index * width, (index + 1) * width),
        ),
  );

export const DryRunPreview = ({
  blueprint,
  plan,
  apply,
  scripts,
  createCommand,
  generatedFiles,
  prospectiveConfig,
}: {
  blueprint: Box.Box<Ansi.AnsiStyle>;
  plan: {
    summary: string;
    tree: Box.Box<Ansi.AnsiStyle>;
    legend: Box.Box<Ansi.AnsiStyle>;
  };
  apply: typeof ApplyResult.Type;
  scripts: ReadonlyArray<{
    label: string;
    command: string;
    phase: string;
    origin: string;
  }>;
  createCommand?: string | undefined;
  generatedFiles?: ReadonlyArray<ApplyPreviewFile> | undefined;
  prospectiveConfig?: string | undefined;
}) => {
  const terminalWidth = process.stdout.columns ?? 80;
  const commandWidth = Math.max(32, terminalWidth - 8);
  const fileContentWidth = Math.max(16, terminalWidth - 10);

  const blueprintContent = Box.vsep(
    [sectionTitle("Blueprint"), blueprint],
    1,
    Box.left,
  );

  const changesStats = Flex.row(
    [
      Flex.fixed(
        Box.text(`${apply.created.length}`).pipe(Box.annotate(Ansi.green)),
      ),
      Flex.fixed(Box.text("create").pipe(Box.annotate(Ansi.dim))),
      Flex.fixed(
        Box.text(`${apply.modified.length}`).pipe(Box.annotate(Ansi.yellow)),
      ),
      Flex.fixed(Box.text("modify").pipe(Box.annotate(Ansi.dim))),
      Flex.fixed(
        Box.text(`${apply.skipped.length}`).pipe(Box.annotate(Ansi.dim)),
      ),
      Flex.fixed(Box.text("skip").pipe(Box.annotate(Ansi.dim))),
    ],
    terminalWidth,
    { gap: 1 },
  );

  const applyContent = Box.vsep(
    [sectionTitle("Apply"), plan.tree, changesStats],
    1,
    Box.left,
  );

  const phaseLabels: Record<string, string> = {
    finalize: "Finalize",
    config: "Install & Format",
    "post-finalize": "Post-Finalize",
  };

  const groupedScripts = scripts.reduce<
    Map<string, Array<(typeof scripts)[number]>>
  >((groups, script) => {
    const list = groups.get(script.phase) ?? [];
    list.push(script);
    groups.set(script.phase, list);
    return groups;
  }, new Map());

  const scriptGroups =
    groupedScripts.size > 0
      ? Box.vcat(
          [...groupedScripts.entries()].map(([phase, items]) =>
            Box.vcat(
              [
                Box.text(phaseLabels[phase] ?? phase).pipe(
                  Box.annotate(Ansi.dim),
                ),
                ...items.map((s) =>
                  Box.hsep(
                    [
                      Box.text(">").pipe(Box.annotate(Ansi.dim)),
                      Box.text(s.command),
                    ],
                    1,
                    Box.left,
                  ),
                ),
              ],
              Box.left,
            ),
          ),
          Box.left,
        )
      : Box.text("(none)").pipe(Box.annotate(Ansi.dim));

  const finalizeContent = Box.vsep(
    [
      ...(createCommand === undefined
        ? []
        : [
            sectionTitle("Create Command"),
            Box.para(createCommand, Box.left, commandWidth).pipe(
              Box.annotate(Ansi.bold),
            ),
          ]),
      sectionTitle("Finalize"),
      scriptGroups,
    ],
    1,
    Box.left,
  );

  const footer = Box.text("No changes written.").pipe(Box.annotate(Ansi.dim));

  const naturalHorizontalWidth =
    Box.cols(blueprintContent) +
    Box.cols(applyContent) +
    Box.cols(finalizeContent) +
    18;

  const panels = Breakpoint.select(terminalWidth, [
    {
      minWidth: naturalHorizontalWidth,
      render: () => {
        const maxHeight = Math.max(
          Box.rows(blueprintContent),
          Box.rows(applyContent),
          Box.rows(finalizeContent),
        );

        const leftPanel = blueprintContent.pipe(
          Box.minHeight(maxHeight),
          Panel.make({
            padding: Box.pad(0, 2),
            border: Box.border("rounded", { annotation: Ansi.dim }),
          }),
        );
        const middlePanel = applyContent.pipe(
          Box.minHeight(maxHeight),
          Panel.make({
            padding: Box.pad(0, 2),
            border: Box.border("rounded", {
              annotation: Ansi.dim,
              sides: { left: false },
            }),
          }),
        );
        const rightPanel = finalizeContent.pipe(
          Box.minHeight(maxHeight),
          Panel.make({
            padding: Box.pad(0, 2),
            border: Box.border("rounded", {
              annotation: Ansi.dim,
              sides: { left: false },
            }),
          }),
        );

        return Flex.row(
          [
            Flex.fixed(leftPanel),
            Flex.fixed(middlePanel),
            Flex.fixed(rightPanel),
          ],
          terminalWidth,
          { align: Box.top },
        );
      },
    },
    {
      minWidth: 0,
      render: () =>
        Container.make({ width: terminalWidth, padding: [0, 2] }, (ctx) => {
          const topPanel = blueprintContent.pipe(
            Box.minWidth(ctx.innerWidth),
            Panel.make({
              padding: Box.pad(0, 1),
              border: Box.border("rounded", {
                annotation: Ansi.dim,
                sides: { bottom: false },
              }),
            }),
          );
          const midPanel = applyContent.pipe(
            Box.minWidth(ctx.innerWidth),
            Panel.make({
              padding: Box.pad(0, 1),
              border: Box.border("rounded", {
                annotation: Ansi.dim,
                sides: { top: false, bottom: false },
              }),
            }),
          );
          const botPanel = finalizeContent.pipe(
            Box.minWidth(ctx.innerWidth),
            Panel.make({
              padding: Box.pad(0, 1),
              border: Box.border("rounded", {
                annotation: Ansi.dim,
                sides: { top: false },
              }),
            }),
          );

          return Box.vcat([topPanel, midPanel, botPanel], Box.left);
        }),
    },
  ]);

  const generatedFilesContent =
    generatedFiles === undefined
      ? []
      : [
          Box.vsep(
            [
              sectionTitle("Generated Files"),
              ...(generatedFiles.length === 0
                ? [Box.text("(none)").pipe(Box.annotate(Ansi.dim))]
                : generatedFiles.map((file) =>
                    Box.vsep(
                      [
                        Box.hsep(
                          [
                            Box.text(
                              file.status === "created" ? "+" : "~",
                            ).pipe(
                              Box.annotate(
                                file.status === "created"
                                  ? Ansi.green
                                  : Ansi.yellow,
                              ),
                            ),
                            Box.text(file.path).pipe(Box.annotate(Ansi.bold)),
                          ],
                          1,
                          Box.left,
                        ),
                        Box.vcat(
                          Arr.map(
                            wrapFileContents(file.contents, fileContentWidth),
                            Box.text,
                          ),
                          Box.left,
                        ).pipe(Box.moveRight(2)),
                      ],
                      1,
                      Box.left,
                    ),
                  )),
            ],
            1,
            Box.left,
          ).pipe(
            Box.minWidth(Math.max(1, terminalWidth - 6)),
            Panel.make({
              padding: Box.pad(0, 2),
              border: Box.border("rounded", { annotation: Ansi.dim }),
            }),
          ),
        ];

  const prospectiveConfigContent =
    prospectiveConfig === undefined
      ? []
      : [
          Box.vsep(
            [
              sectionTitle("Prospective stack config"),
              Box.vcat(
                Arr.map(
                  wrapFileContents(prospectiveConfig, fileContentWidth),
                  Box.text,
                ),
                Box.left,
              ).pipe(Box.moveRight(2)),
            ],
            1,
            Box.left,
          ).pipe(
            Box.minWidth(Math.max(1, terminalWidth - 6)),
            Panel.make({
              padding: Box.pad(0, 2),
              border: Box.border("rounded", { annotation: Ansi.dim }),
            }),
          ),
        ];

  return Box.vsep(
    [panels, ...generatedFilesContent, ...prospectiveConfigContent, footer],
    1,
    Box.left,
  ).pipe(Box.moveDown(1));
};
