"use client";

import { useState } from "react";
import { CommandDock } from "~/components/molecules/command-dock";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { FileTree } from "~/components/organisms/file-tree";
import { Badge } from "~/components/ui/badge";

const primitives = [
  ["Alert", "Builder errors"],
  ["Badge", "Builder, brand"],
  ["Button", "Shared throughout"],
  ["Checkbox", "Module tree"],
  ["Collapsible", "DisclosurePanel, FileTree"],
  ["Empty", "Builder empty states"],
  ["Field", "Target and module fields"],
  ["Input", "Docs and builder"],
  ["Label", "Shared forms"],
  ["Resizable", "Repository explorer"],
  ["ScrollArea", "Repository explorer"],
  ["Separator", "Docs and brand"],
  ["Sheet", "Mobile navigation"],
  ["Sidebar", "Documentation shell"],
  ["Skeleton", "Loading states"],
  ["Spinner", "Preview status"],
  ["Tabs", "Target workspace"],
  ["Tooltip", "Documentation shell"],
] as const;

const tree = [
  {
    name: "apps",
    children: [
      {
        name: "web",
        children: [{ name: "package.json", path: "apps/web/package.json" }],
      },
    ],
  },
  { name: "package.json", path: "package.json" },
] as const;

export function DesignSystemInventory() {
  const [selectedPath, setSelectedPath] = useState("apps/web/package.json");
  return (
    <div className="my-6 flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">
            Atomic primitives
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Source-owned shadcn components in <code>components/ui</code> and
            their current primary consumers.
          </p>
        </div>
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="grid grid-cols-[minmax(8rem,0.6fr)_1fr] border-b bg-muted/30 px-4 py-2 font-mono text-xs text-muted-foreground">
            <span>Component</span>
            <span>Used by</span>
          </div>
          {primitives.map(([name, consumer]) => (
            <div
              key={name}
              className="grid min-h-10 grid-cols-[minmax(8rem,0.6fr)_1fr] items-center border-b px-4 py-2 last:border-b-0"
            >
              <code className="font-mono text-xs">{name}</code>
              <span className="text-sm text-muted-foreground">{consumer}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">Molecules</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Data-agnostic compositions built from atomic primitives.
          </p>
        </div>
        <DisclosurePanel
          title={
            <>
              Disclosure panel <Badge variant="secondary">Molecule</Badge>
            </>
          }
          description="Progressively reveals secondary or advanced content. Used by the Blueprint and repository panels."
          headingLevel="h4"
          defaultOpen
        >
          <p className="p-5 text-sm text-muted-foreground">
            The trigger, focus treatment, summary metadata, and mounted-content
            policy are shared while each consumer owns its data.
          </p>
        </DisclosurePanel>
        <CommandDock
          summary="2 targets"
          command="stack-effect create my-effect-app --target client-react/web"
          sticky={false}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="font-heading text-base font-semibold">Organisms</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Reusable operational regions with their own interaction state.
          </p>
        </div>
        <div className="overflow-hidden rounded-md border bg-card">
          <div className="border-b px-4 py-3">
            <span className="font-heading text-sm font-semibold">FileTree</span>
            <span className="ml-2 text-xs text-muted-foreground">
              Repository explorer
            </span>
          </div>
          <div className="max-w-sm p-2">
            <FileTree
              nodes={tree}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
