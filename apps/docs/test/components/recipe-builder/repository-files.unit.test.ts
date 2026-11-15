import { expect, test } from "vitest";
import {
  compareFiles,
  fileTree,
} from "../../../app/components/recipe-builder/repository-files";

test("summarizes nested changes on surviving folders, including removals", () => {
  const file = (path: string, contents = "") => ({
    path,
    contents,
    status: "created" as const,
  });
  const before = [
    file("apps/api/main.ts"),
    file("apps/api/old/util.ts"),
    file("README.md"),
  ];
  const after = [
    file("apps/api/main.ts", "updated"),
    file("apps/api/new/util.ts"),
    file("README.md"),
  ];
  const changes = compareFiles(before, after);
  const tree = fileTree(
    after.map(({ path }) => path),
    changes,
  );
  const counts = { Added: 1, Changed: 1, Removed: 1 };
  expect(tree).toMatchObject([
    {
      name: "apps",
      folderChanges: counts,
      children: [
        {
          name: "api",
          folderChanges: counts,
          children: [
            {
              name: "new",
              folderChanges: { Added: 1, Changed: 0, Removed: 0 },
              children: [{ name: "util.ts", change: "Added" }],
            },
            { name: "main.ts", change: "Changed" },
          ],
        },
      ],
    },
    { name: "README.md", change: undefined },
  ]);
  expect(changes).toContainEqual({
    path: "apps/api/old/util.ts",
    status: "Removed",
  });
});
