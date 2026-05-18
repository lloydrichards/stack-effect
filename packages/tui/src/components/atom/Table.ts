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

  const divider = Box.text(
    columns.map(({ width }) => "─".repeat(width)).join("─┼─"),
  );

  const dataRows = rows.map((row) => {
    // First pass: align horizontally
    const sized = row.map((cell, i) => {
      const col = columns[i];
      return cell.pipe(
        Box.alignHoriz(col?.align ?? Box.left, col?.width ?? 12),
      );
    });

    // Compute max height across all cells in the row
    const maxHeight = Math.max(...sized.map((c) => Box.rows(c)));

    // Second pass: align vertically so all cells share the same height
    const aligned = sized.map((cell) =>
      cell.pipe(Box.alignVert(Box.top, maxHeight)),
    );

    // Build a separator column matching the row height
    const rowSep = Box.vcat(
      Array.from({ length: maxHeight }, () => Box.text(" │ ")),
      Box.left,
    );

    return Box.punctuateH(aligned, Box.top, rowSep);
  });

  return Box.vcat([headerRow, divider, ...dataRows], Box.left);
};
