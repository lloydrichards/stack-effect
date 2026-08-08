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
  readonly register: (element: HTMLButtonElement | null) => void;
  readonly onFocus: () => void;
  readonly onActivate: () => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

export function FileTreeNode({
  item,
  selected,
  focused,
  register,
  onFocus,
  onActivate,
  onKeyDown,
}: FileTreeNodeProps) {
  const folder = item.node.children !== undefined;
  return (
    <Button
      ref={register}
      role="treeitem"
      variant="ghost"
      tabIndex={focused ? 0 : -1}
      aria-level={item.depth + 1}
      aria-expanded={folder ? item.open : undefined}
      aria-selected={selected}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "min-h-11 w-full justify-start px-1 aria-expanded:bg-transparent lg:min-h-8",
        selected && "bg-accent",
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
      <span className="truncate">{item.node.name}</span>
    </Button>
  );
}
