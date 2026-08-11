"use client";

import type { RecipePreview } from "@repo/scaffold/recipe-preview";
import { Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { FileCode2 } from "lucide-react";
import { type CSSProperties, useId, useMemo, useState } from "react";
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
import type {
  HighlightedSource,
  SyntaxToken,
} from "../../lib/syntax-highlighter";
import { useRecipeBuilderPreview } from "./recipe-builder-context";
import { useHighlightedSource } from "./use-highlighted-source";
import type { RecipeBuilderWorkerModel } from "./use-recipe-builder-worker";

export function RepositoryExplorer() {
  const { canPreview, previewResult } = useRecipeBuilderPreview();
  const preview = Option.getOrUndefined(AsyncResult.value(previewResult));
  const selectedFileLabelId = useId();
  const [mobilePane, setMobilePane] = useState("files");
  const [selectedFile, setSelectedFile] = useState("");
  const files = preview?.files ?? emptyFiles;
  const activeFile = files.some((file) => file.path === selectedFile)
    ? selectedFile
    : (files[0]?.path ?? "");
  const tree = useMemo(() => fileTree(files.map((file) => file.path)), [files]);
  const source =
    files.find((file) => file.path === activeFile)?.contents ??
    "// Select a file to inspect its generated contents";
  const highlightedSource = useHighlightedSource(activeFile, source);

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
        <code>{renderHighlightedSource(highlightedSource)}</code>
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
      <ScrollArea className="min-h-0 flex-1" viewportClassName="p-2">
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
          className="min-h-80"
          role="status"
          aria-live="polite"
          aria-busy={canPreview && previewResult.waiting}
        >
          <EmptyMedia variant="icon">
            {canPreview && previewResult.waiting ? <Spinner /> : <FileCode2 />}
          </EmptyMedia>
          <EmptyDescription>
            {previewStatusMessage(previewResult, canPreview)}
          </EmptyDescription>
        </Empty>
      ) : files.length === 0 ? (
        <Empty className="min-h-80">
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
                {renderExplorer(setSelectedFile, true)}
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
            className="lg:hidden"
          >
            <TabsList className="w-full" aria-label="Repository view">
              <TabsTrigger value="files">Files</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent
              value="files"
              keepMounted
              className="flex min-h-80 max-h-120 flex-col overflow-hidden"
              style={{ height: "60vh" }}
            >
              {renderExplorer((path) => {
                setSelectedFile(path);
                setMobilePane("preview");
              }, false)}
            </TabsContent>
            <TabsContent
              value="preview"
              keepMounted
              className="flex min-h-80 max-h-120 flex-col overflow-hidden"
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

const emptyFiles: NonNullable<RecipePreview["files"]> = [];

function previewStatusMessage(
  result: RecipeBuilderWorkerModel["previewResult"],
  canPreview: boolean,
) {
  if (!canPreview)
    return "Complete the Selection to generate the repository preview.";

  return AsyncResult.builder(result)
    .onInitialOrWaiting(() => "Generating the repository preview…")
    .onSuccess(() => "The repository preview contains no files.")
    .onInterrupt(() => "Generating the repository preview…")
    .onFailure(
      () =>
        "The repository preview is unavailable. Review the error above and try again.",
    )
    .exhaustive();
}

function renderHighlightedSource(source: HighlightedSource) {
  return source.map((line, lineIndex) => (
    <span key={lineIndex} className="block min-h-6">
      {line.map((token, tokenIndex) => (
        <span
          key={`${tokenIndex}-${token.content.slice(0, 8)}`}
          className="text-(--shiki-light) dark:text-(--shiki-dark)"
          style={tokenStyle(token)}
        >
          {token.content}
        </span>
      ))}
    </span>
  ));
}

type ShikiTokenStyle = CSSProperties & {
  "--shiki-light"?: string;
  "--shiki-dark"?: string;
};

function tokenStyle(token: SyntaxToken): ShikiTokenStyle {
  const fontStyle = token.fontStyle ?? 0;
  return {
    ...(token.light === undefined ? {} : { "--shiki-light": token.light }),
    ...(token.dark === undefined ? {} : { "--shiki-dark": token.dark }),
    ...(fontStyle & 1 ? { fontStyle: "italic" } : {}),
    ...(fontStyle & 2 ? { fontWeight: "bold" } : {}),
    ...(fontStyle & 4 ? { textDecoration: "underline" } : {}),
  };
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
