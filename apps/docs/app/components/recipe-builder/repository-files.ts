import type { RecipePreview } from "@repo/scaffold/recipe-preview";
import type { FileTreeNodeData } from "~/components/organisms/file-tree";

export type Files = NonNullable<RecipePreview["files"]>;
export type FileChange = {
  path: string;
  status: "Added" | "Changed" | "Removed";
};

export const compareFiles = (before: Files, after: Files): FileChange[] => {
  const previous = new Map(before.map((file) => [file.path, file.contents]));
  const changes: FileChange[] = [];
  for (const file of after) {
    if (!previous.has(file.path))
      changes.push({ path: file.path, status: "Added" });
    else if (previous.get(file.path) !== file.contents)
      changes.push({ path: file.path, status: "Changed" });
    previous.delete(file.path);
  }
  for (const path of previous.keys()) changes.push({ path, status: "Removed" });
  return changes;
};

export const fileTree = (
  paths: ReadonlyArray<string>,
  changes: ReadonlyArray<FileChange>,
): ReadonlyArray<FileTreeNodeData> => {
  type MutableNode = {
    name: string;
    path?: string;
    children?: Map<string, MutableNode>;
  };
  const statuses = new Map(
    changes.flatMap(({ path, status }) =>
      status === "Removed" ? [] : [[path, status] as const],
    ),
  );
  const folderChanges = new Map<string, Record<FileChange["status"], number>>();
  for (const { path, status } of changes) {
    let parent = "";
    for (const part of path.split("/").slice(0, -1)) {
      parent = parent ? parent + "/" + part : part;
      const counts = folderChanges.get(parent) ?? {
        Added: 0,
        Changed: 0,
        Removed: 0,
      };
      counts[status]++;
      folderChanges.set(parent, counts);
    }
  }
  const root = new Map<string, MutableNode>();
  for (const path of paths) {
    const parts = path.split("/");
    let level = root;
    parts.forEach((part, index) => {
      const leaf = index === parts.length - 1;
      const current = level.get(part) ?? {
        name: part,
        ...(leaf ? { path } : { children: new Map() }),
      };
      level.set(part, current);
      if (!leaf) level = current.children ?? level;
    });
  }
  const serialize = (
    level: Map<string, MutableNode>,
    prefix = "",
  ): ReadonlyArray<FileTreeNodeData> =>
    Array.from(level.values())
      .sort(
        (left, right) =>
          Number(Boolean(right.children)) - Number(Boolean(left.children)) ||
          left.name.localeCompare(right.name),
      )
      .map((node) => ({
        name: node.name,
        ...(node.path
          ? { path: node.path, change: statuses.get(node.path) }
          : {}),
        ...(node.children
          ? {
              children: serialize(node.children, prefix + node.name + "/"),
              folderChanges: folderChanges.get(prefix + node.name),
            }
          : {}),
      }));
  return serialize(root);
};
