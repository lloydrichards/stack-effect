"use client";

import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { VisibleFileTreeNode } from "./file-tree";

type FileTreeNodeProps = {
  readonly item: VisibleFileTreeNode;
  readonly selected: boolean;
  readonly focused: boolean;
  readonly activeFolder: boolean;
  readonly register: (element: HTMLButtonElement | null) => void;
  readonly onFocus: () => void;
  readonly onActivate: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export function FileTreeNode({
  item,
  selected,
  focused,
  activeFolder,
  register,
  onFocus,
  onActivate,
  onKeyDown,
}: FileTreeNodeProps) {
  const folder = item.node.children !== undefined;
  const counts = item.open ? undefined : item.node.folderChanges;
  const summary =
    counts &&
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([status, count]) => count + " " + status.toLowerCase())
      .join(", ");
  const change = counts
    ? counts.Changed || counts.Removed
      ? "Changed"
      : "Added"
    : item.node.change;
  const description = [
    activeFolder && "Active target folder",
    summary ? "Files inside: " + summary : item.node.change,
  ]
    .filter(Boolean)
    .join(". ");
  const statusColor =
    change === "Changed"
      ? "text-amber-800 dark:text-amber-300"
      : change === "Added"
        ? "text-primary"
        : undefined;
  return (
    <Button
      ref={register}
      role="treeitem"
      variant="ghost"
      tabIndex={focused ? 0 : -1}
      aria-description={description || undefined}
      title={summary}
      aria-level={item.depth + 1}
      aria-expanded={folder ? item.open : undefined}
      aria-selected={selected}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "w-full justify-start px-1 aria-expanded:bg-transparent",
        activeFolder && "font-semibold",
        selected
          ? "bg-accent hover:bg-accent dark:hover:bg-accent"
          : "hover:bg-transparent dark:hover:bg-transparent",
      )}
      style={{ paddingLeft: `${item.depth * 12 + (folder ? 4 : 20)}px` }}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={onActivate}
    >
      {folder ? (
        <>
          {item.open ? <ChevronDown /> : <ChevronRight />}
          {item.open ? (
            <FolderOpen className="text-muted-foreground" />
          ) : (
            <Folder className="text-muted-foreground" />
          )}
        </>
      ) : (
        <FileCode2 />
      )}
      <span
        className={cn(
          "truncate group-hover/button:underline underline-offset-2",
          statusColor,
        )}
      >
        {item.node.name}
      </span>
      {summary && (
        <span
          aria-hidden="true"
          className={cn(
            "ms-auto me-1.5 size-1.5 shrink-0 rounded-full bg-current",
            statusColor,
          )}
        />
      )}
      {item.node.change && (
        <span
          aria-hidden="true"
          title={change}
          className={cn("ms-auto shrink-0 px-1 font-mono text-xs", statusColor)}
        >
          {change === "Added" ? "A" : "M"}
        </span>
      )}
    </Button>
  );
}
