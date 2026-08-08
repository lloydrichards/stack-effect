"use client";

import { FileCode2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import {
  FileTree,
  type FileTreeNodeData,
} from "~/components/organisms/file-tree";
import { Empty, EmptyDescription, EmptyMedia } from "~/components/ui/empty";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "~/components/ui/resizable";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Spinner } from "~/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import type { RecipePreviewOutputWire } from "../../worker/recipe-preview-protocol";
import type { PreviewState } from "./use-recipe-builder-state";

type RepositoryExplorerProps = {
  readonly preview: RecipePreviewOutputWire | undefined;
  readonly state: PreviewState;
  readonly activeFile: string;
  readonly setActiveFile: (path: string) => void;
};

export function RepositoryExplorer({
  preview,
  state,
  activeFile,
  setActiveFile,
}: RepositoryExplorerProps) {
  const selectedFileLabelId = useId();
  const [mobilePane, setMobilePane] = useState("files");
  const files = preview?.files ?? emptyFiles;
  const tree = useMemo(() => fileTree(files.map((file) => file.path)), [files]);
  const source =
    files.find((file) => file.path === activeFile)?.contents ??
    "// Select a file to inspect its generated contents";
  const highlightedSource = useMemo(() => highlight(source), [source]);

  const renderEditor = (viewport: "desktop" | "mobile") => (
    <div className="flex h-full min-w-0 flex-col bg-code-block">
      <div
        id={`${selectedFileLabelId}-${viewport}`}
        className="flex min-w-0 items-center border-b bg-background px-3 py-2 font-mono text-xs"
      >
        <FileCode2 className="mr-2 shrink-0 text-primary" />
        <span className="truncate" title={activeFile}>
          {activeFile || "No file selected"}
        </span>
      </div>
      <pre
        className="min-h-0 flex-1 overflow-auto p-4 font-terminal text-xs leading-6"
        role="region"
        aria-labelledby={`${selectedFileLabelId}-${viewport}`}
        tabIndex={0}
      >
        <code>{highlightedSource}</code>
      </pre>
    </div>
  );
  const renderExplorer = (
    onSelect: (path: string) => void,
    showHeading: boolean,
  ) => (
    <div className="flex h-full min-h-0 flex-col">
      {showHeading ? (
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          Files
        </div>
      ) : null}
      <ScrollArea className="min-h-0 flex-1 p-2">
        <FileTree nodes={tree} selectedPath={activeFile} onSelect={onSelect} />
      </ScrollArea>
    </div>
  );
  return (
    <DisclosurePanel
      title="Generated repository"
      description={
        <>
          <span className="sm:hidden">Browse generated files and source.</span>
          <span className="hidden sm:inline">
            Actual output from ApplyPreviewService running on MemoryFileSystem.
          </span>
        </>
      }
      meta={
        <span className="font-mono text-xs text-muted-foreground">
          {files.length} {files.length === 1 ? "file" : "files"}
        </span>
      }
      defaultOpen
      keepMounted
    >
      {preview === undefined ? (
        <Empty
          className="min-h-80 border-0"
          role="status"
          aria-live="polite"
          aria-busy={state === "starting" || state === "loading"}
        >
          <EmptyMedia variant="icon">
            {state === "starting" || state === "loading" ? (
              <Spinner />
            ) : (
              <FileCode2 />
            )}
          </EmptyMedia>
          <EmptyDescription>{previewStatusMessage(state)}</EmptyDescription>
        </Empty>
      ) : files.length === 0 ? (
        <Empty className="min-h-80 border-0">
          <EmptyMedia variant="icon">
            <FileCode2 />
          </EmptyMedia>
          <EmptyDescription>
            The preview completed without generating any files.
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <div className="hidden h-[max(10rem,calc(100dvh-18rem))] lg:block">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={25} minSize={18}>
                {renderExplorer(setActiveFile, true)}
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={75} minSize={35}>
                {renderEditor("desktop")}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
          <Tabs
            value={mobilePane}
            onValueChange={setMobilePane}
            className="gap-0 lg:hidden"
          >
            <TabsList className="w-full" aria-label="Repository view">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent
              value="files"
              keepMounted
              className="flex min-h-80 max-h-[30rem] flex-col overflow-hidden"
              style={{ height: "60vh" }}
            >
              {renderExplorer((path) => {
                setActiveFile(path);
                setMobilePane("preview");
              }, false)}
            </TabsContent>
            <TabsContent
              value="preview"
              keepMounted
              className="flex min-h-80 max-h-[30rem] flex-col overflow-hidden"
              style={{ height: "60vh" }}
            >
              {renderEditor("mobile")}
            </TabsContent>
          </Tabs>
        </>
      )}
    </DisclosurePanel>
  );
}

const emptyFiles: NonNullable<RecipePreviewOutputWire["files"]> = [];

function previewStatusMessage(state: PreviewState) {
  if (state === "starting" || state === "loading") {
    return "Generating the repository preview…";
  }
  if (state === "error") {
    return "The repository preview is unavailable. Review the error above and try again.";
  }
  return "Complete the Selection to generate the repository preview.";
}

function highlight(source: string) {
  return source
    .split(
      /(\b(?:export|const|function|return|import|from|class|new)\b|"[^"\n]*"|\/\/[^\n]*)/g,
    )
    .map((token, index) => (
      <span
        key={`${index}-${token.slice(0, 4)}`}
        className={cn(
          /^(export|const|function|return|import|from|class|new)$/.test(
            token,
          ) && "text-info",
          token.startsWith('"') && "text-success",
          token.startsWith("//") && "text-muted-foreground",
        )}
      >
        {token}
      </span>
    ));
}

function fileTree(
  paths: ReadonlyArray<string>,
): ReadonlyArray<FileTreeNodeData> {
  type MutableNode = {
    name: string;
    path?: string;
    children?: Map<string, MutableNode>;
  };
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
  ): ReadonlyArray<FileTreeNodeData> =>
    Array.from(level.values())
      .sort(
        (left, right) =>
          Number(Boolean(right.children)) - Number(Boolean(left.children)) ||
          left.name.localeCompare(right.name),
      )
      .map((node) => ({
        name: node.name,
        ...(node.path ? { path: node.path } : {}),
        ...(node.children ? { children: serialize(node.children) } : {}),
      }));
  return serialize(root);
}
