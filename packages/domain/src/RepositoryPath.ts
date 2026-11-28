import { Schema } from "effect";

/** A canonical POSIX path relative to the repository root. */
export const RepositoryPath = Schema.String.check(
  Schema.makeFilter(
    (path) =>
      path === "." ||
      (!/[\\\0]/.test(path) &&
        !/^[a-z]:/i.test(path) &&
        path
          .split("/")
          .every((part) => part !== "" && part !== "." && part !== "..")) ||
      "Expected a canonical repository-relative path",
  ),
).pipe(Schema.brand("RepositoryPath"));

export type RepositoryPath = typeof RepositoryPath.Type;
