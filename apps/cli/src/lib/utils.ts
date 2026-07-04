import { Array as Arr, pipe } from "effect";

export const splitCommaSeparated = (
  values: ReadonlyArray<string>,
): Array<string> =>
  pipe(
    values,
    Arr.flatMap((value) =>
      pipe(
        value.split(","),
        Arr.map((part) => part.trim()),
        Arr.filter((part) => part.length > 0),
      ),
    ),
  );

export const duplicatedValues = (
  values: ReadonlyArray<string>,
): Array<string> =>
  pipe(
    Arr.groupBy(values, (value) => value),
    Object.entries,
    Arr.filter(([, grouped]) => grouped.length > 1),
    Arr.map(([value]) => value),
  );
