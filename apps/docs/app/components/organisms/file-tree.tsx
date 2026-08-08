"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileTreeNode } from "./file-tree-node";

export type FileTreeNodeData = {
  readonly name: string;
  readonly path?: string;
  readonly children?: ReadonlyArray<FileTreeNodeData>;
};

type FileTreeProps = {
  readonly nodes: ReadonlyArray<FileTreeNodeData>;
  readonly selectedPath: string | undefined;
  readonly onSelect: (path: string) => void;
};

export function FileTree({ nodes, selectedPath, onSelect }: FileTreeProps) {
  const [openByKey, setOpenByKey] = useState<ReadonlyMap<string, boolean>>(
    () => new Map(),
  );
  const visibleNodes = useMemo(
    () => flattenVisibleNodes(nodes, openByKey),
    [nodes, openByKey],
  );
  const [focusedKey, setFocusedKey] = useState(selectedPath ?? "");
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());
  const effectiveFocusedKey = visibleNodes.some(
    (item) => item.key === focusedKey,
  )
    ? focusedKey
    : (visibleNodes[0]?.key ?? "");

  useEffect(() => {
    if (selectedPath) setFocusedKey(selectedPath);
  }, [selectedPath]);

  const focusItem = (key: string) => {
    setFocusedKey(key);
    itemRefs.current.get(key)?.focus();
  };

  return (
    <div role="tree" aria-label="Generated files">
      {visibleNodes.map((item, index) => (
        <FileTreeNode
          key={item.key}
          item={item}
          selected={selectedPath === item.node.path}
          focused={effectiveFocusedKey === item.key}
          register={(element) => {
            if (element) itemRefs.current.set(item.key, element);
            else itemRefs.current.delete(item.key);
          }}
          onFocus={() => setFocusedKey(item.key)}
          onActivate={() => {
            if (item.node.children) {
              setOpenByKey((current) => {
                const next = new Map(current);
                next.set(item.key, !item.open);
                return next;
              });
            } else if (item.node.path) {
              onSelect(item.node.path);
            }
          }}
          onKeyDown={(event) => {
            const previous = visibleNodes[index - 1];
            const next = visibleNodes[index + 1];
            const last = visibleNodes.at(-1);
            if (event.key === "ArrowDown" && next) {
              event.preventDefault();
              focusItem(next.key);
            } else if (event.key === "ArrowUp" && previous) {
              event.preventDefault();
              focusItem(previous.key);
            } else if (event.key === "Home" && visibleNodes[0]) {
              event.preventDefault();
              focusItem(visibleNodes[0].key);
            } else if (event.key === "End" && last) {
              event.preventDefault();
              focusItem(last.key);
            } else if (event.key === "ArrowRight" && item.node.children) {
              event.preventDefault();
              if (item.open && next?.parentKey === item.key)
                focusItem(next.key);
              else if (!item.open) event.currentTarget.click();
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              if (item.node.children && item.open) event.currentTarget.click();
              else if (item.parentKey) focusItem(item.parentKey);
            }
          }}
        />
      ))}
    </div>
  );
}

export type VisibleFileTreeNode = {
  readonly key: string;
  readonly node: FileTreeNodeData;
  readonly depth: number;
  readonly parentKey?: string;
  readonly open?: boolean;
};

function flattenVisibleNodes(
  nodes: ReadonlyArray<FileTreeNodeData>,
  openByKey: ReadonlyMap<string, boolean>,
  parentKey?: string,
  depth = 0,
): ReadonlyArray<VisibleFileTreeNode> {
  return nodes.flatMap((node) => {
    const key = node.path ?? [parentKey, node.name].filter(Boolean).join("/");
    const open = node.children ? (openByKey.get(key) ?? depth < 2) : undefined;
    const item = {
      key,
      node,
      depth,
      ...(parentKey ? { parentKey } : {}),
      ...(open === undefined ? {} : { open }),
    };
    return [
      item,
      ...(node.children && open
        ? flattenVisibleNodes(node.children, openByKey, key, depth + 1)
        : []),
    ];
  });
}
