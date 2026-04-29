import { Ansi, Box } from "effect-boxes";

export const Table = (
  columns: ReadonlyArray<{
    readonly header: string;
    readonly width: number;
    readonly align?: typeof Box.left;
    readonly headerAlign?: typeof Box.left;
  }>,
  rows: Box.Box<Ansi.AnsiStyle>[][],
): Box.Box<Ansi.AnsiStyle> => {
  const sep = Box.text(" │ ");

  const headerRow = Box.punctuateH(
    columns.map(({ header, width, headerAlign }) =>
      Box.text(header).pipe(
        Box.alignHoriz(headerAlign ?? Box.center1, width),
        Box.annotate(Ansi.bold),
      ),
    ),
    Box.top,
    sep,
  );

  const divider = Box.text("─".repeat(headerRow.cols));

  const dataRows = rows.map((row) =>
    Box.punctuateH(
      row.map((cell, i) => {
        const col = columns[i];
        return cell.pipe(
          Box.alignHoriz(col?.align ?? Box.left, col?.width ?? 12),
        );
      }),
      Box.top,
      sep,
    ),
  );

  return Box.vcat([headerRow, divider, ...dataRows], Box.left);
};
