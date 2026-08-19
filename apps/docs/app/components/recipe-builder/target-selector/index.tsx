import { Plus } from "lucide-react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Skeleton } from "~/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { cn } from "~/lib/utils";
import { RecipeBuilderCatalog } from "../../../workers/recipe-builder/domain";
import { TargetConfiguration } from "./target-configuration";
import { newTargetTabId, useTargetEditor } from "./use-target-editor";

export function TargetSelector() {
  const {
    activeId,
    activeTarget,
    addTarget,
    catalog,
    catalogFailed,
    catalogOwnersByTargetId,
    registerTargetTab,
    removeTarget,
    selectTarget,
    supportSelections,
    targets,
    toggleModule,
    toggleSupportModule,
  } = useTargetEditor();
  const availableTargets =
    catalog?.targets.filter((target) => target.kind !== "workspace") ?? [];
  return (
    <DisclosurePanel
      title="Targets"
      description="Choose applications and attach their modules."
      defaultOpen
      meta={
        <span className="font-mono text-xs text-muted-foreground">
          {targets.length} app {targets.length === 1 ? "target" : "targets"}
        </span>
      }
    >
      <Tabs value={activeId} onValueChange={selectTarget}>
        <div className="flex min-w-0 items-center gap-2 border-b p-2">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <TabsList aria-label="Recipe targets">
              {targets.map((target) => (
                <TabsTrigger
                  key={target.id}
                  ref={(element) => {
                    registerTargetTab(target.id, element);
                  }}
                  value={target.id}
                >
                  {target.name
                    ? `${target.name} · ${target.kind}`
                    : target.kind}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <Button
            variant="ghost"
            size="lg"
            className="w-11 shrink-0 p-0 sm:w-auto sm:px-4"
            aria-label="Add target"
            disabled={activeId === newTargetTabId}
            onClick={() => selectTarget(newTargetTabId)}
          >
            <Plus data-icon="inline-start" />
            <span className="hidden sm:inline">Add target</span>
          </Button>
        </div>
        {targets.map((target, targetIndex) => (
          <TabsContent key={target.id} value={target.id}>
            {activeTarget?.id === target.id ? (
              <TargetConfiguration
                catalog={catalog}
                catalogFailed={catalogFailed}
                catalogOwner={catalogOwnersByTargetId.get(target.id)}
                onRemoveTarget={removeTarget}
                onToggleModule={toggleModule}
                onToggleSupportModule={toggleSupportModule}
                supportSelections={supportSelections}
                target={target}
                targetIndex={targetIndex}
                targets={targets}
              />
            ) : null}
          </TabsContent>
        ))}
        {activeTarget ? null : (
          <TargetOptions
            onAddTarget={addTarget}
            firstTarget={targets.length === 0}
            targets={availableTargets}
          />
        )}
      </Tabs>
    </DisclosurePanel>
  );
}

type TargetOptionsProps = {
  readonly firstTarget: boolean;
  readonly onAddTarget: (kind: string) => void;
  readonly targets: (typeof RecipeBuilderCatalog.Type)["targets"];
};

function TargetOptions({
  firstTarget,
  onAddTarget,
  targets,
}: TargetOptionsProps) {
  return (
    <Empty className="min-h-64 items-stretch gap-5 p-5 md:p-6">
      <EmptyHeader className="mx-0 max-w-xl items-start text-left">
        <EmptyTitle>
          {firstTarget ? "Add your first target" : "Choose another target"}
        </EmptyTitle>
        <EmptyDescription>
          {firstTarget
            ? "Start with the application you want to build. Its modules will bring in supporting targets automatically."
            : "Select an application type for this tab. You can use the same kind more than once and give each target its own name."}
        </EmptyDescription>
      </EmptyHeader>
      {targets.length > 0 ? (
        <div
          className="grid w-full overflow-hidden rounded-md border sm:grid-cols-2"
          aria-label="Available target types"
        >
          {targets.map((target, index) => (
            <button
              key={target.kind}
              type="button"
              className={cn(
                "group flex min-h-24 w-full items-start gap-3 bg-background p-3.5 text-left transition-colors hover:bg-muted/35 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none",
                index > 0 && "border-t",
                "sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(even)]:border-l",
              )}
              onClick={() => onAddTarget(target.kind)}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-heading text-sm font-semibold text-foreground">
                    {target.title}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {target.kind}
                  </span>
                </span>
                <span className="mt-1.5 block text-sm leading-5 text-muted-foreground">
                  {target.description}
                </span>
              </span>
              <Plus
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      ) : (
        <div
          className="grid w-full overflow-hidden rounded-md border sm:grid-cols-2"
          aria-label="Loading target types"
          aria-busy="true"
        >
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="min-h-24 border-b p-3.5 last:border-b-0 sm:border-r sm:last:border-r-0"
            >
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-4 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-4/5" />
            </div>
          ))}
          <span className="sr-only">Loading target types</span>
        </div>
      )}
    </Empty>
  );
}
