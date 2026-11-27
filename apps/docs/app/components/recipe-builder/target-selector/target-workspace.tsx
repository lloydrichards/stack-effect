import { CornerDownRight, ChevronDown, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { ownerKey, type TargetInstance } from "../form";
import { ActiveTargetConfiguration } from "./target-configuration";
import { AddTargetPicker } from "./target-options";
import { type useTargetEditor } from "./use-target-editor";

const targetOrigin = (
  target: TargetInstance,
  {
    targets,
    catalog,
    catalogOwnersByTargetId,
  }: ReturnType<typeof useTargetEditor>,
) => {
  const sources = targets.flatMap((source) => {
    if (source.id === target.id) return [];
    const modules = catalog?.targetModules.find(
      ({ owner }) =>
        ownerKey(owner) ===
        ownerKey(catalogOwnersByTargetId.get(source.id) ?? source),
    )?.modules;
    return source.modules.flatMap((id) => {
      const module = modules?.find((candidate) => candidate.id === id);
      const tracked = target.requirements?.some(
        (edge) =>
          edge.sourceTargetId === source.id && edge.sourceModuleId === id,
      );
      const usesTarget =
        module?.implies.some(
          (edge) =>
            edge.targetKind === target.kind &&
            target.modules.includes(edge.moduleId),
        ) &&
        targets.filter((candidate) => candidate.kind === target.kind).length ===
          1;
      return tracked || usesTarget
        ? [`${module?.title ?? id} in ${ownerKey(source)}`]
        : [];
    });
  });
  return sources.length
    ? `${target.addedByDependency ? "Included by" : "Used by"} ${sources.join(", ")}`
    : undefined;
};

export const TargetWorkspace = ({
  editor,
}: {
  editor: ReturnType<typeof useTargetEditor>;
}) => {
  const { targets, catalog, activeTarget, selectTarget } = editor;
  const [adding, setAdding] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const chooserHeading = useRef<HTMLHeadingElement>(null);
  const showChooser = adding || targets.length === 0;
  const focusHeading = () =>
    requestAnimationFrame(() => heading.current?.focus());
  const showOverview = () => {
    selectTarget(undefined);
    setAdding(false);
    focusHeading();
  };
  const titleOf = (target: TargetInstance) =>
    catalog?.targets.find(({ kind }) => kind === target.kind)?.title ??
    target.kind;
  const edit = (target: TargetInstance) => {
    setAdding(false);
    selectTarget(target.id);
  };
  if (showChooser) {
    return (
      <section className="space-y-4" aria-labelledby="add-target-heading">
        <div className="flex items-center justify-between">
          <h2
            ref={chooserHeading}
            id="add-target-heading"
            tabIndex={-1}
            className="scroll-mt-20 font-heading text-xl font-semibold focus:outline-none"
          >
            Add a target
          </h2>
          {targets.length > 0 && (
            <Button variant="ghost" size="sm" onClick={showOverview}>
              Cancel
            </Button>
          )}
        </div>
        <AddTargetPicker
          targets={catalog?.targets.filter(({ kind }) => kind !== "workspace")}
          instances={targets}
          catalogFailed={editor.catalogFailed}
          onAddTarget={(kind) => {
            editor.addTarget(kind);
            showOverview();
          }}
        />
      </section>
    );
  }
  return (
    <section aria-labelledby="workspace-targets-heading" className="space-y-4">
      <h2
        id="workspace-targets-heading"
        ref={heading}
        tabIndex={-1}
        className="scroll-mt-20 font-heading text-xl font-semibold tracking-tight focus:outline-none"
      >
        Your targets
      </h2>
      <p className="text-sm text-muted-foreground">
        Add the apps and packages in your project, then open a target to edit
        its modules.
      </p>
      {targets.length > 0 && (
        <ul aria-label="Selected targets" className="divide-y border-y">
          {targets.map((target) => {
            const name =
              target.name ||
              catalog?.targets.find(({ kind }) => kind === target.kind)
                ?.defaultName ||
              target.kind;
            const expanded = activeTarget?.id === target.id;
            const presetName = editor.presetNames.get(ownerKey(target));
            const origin = presetName
              ? `Included by ${presetName}`
              : (targetOrigin(target, editor) ??
                (target.addedByDependency
                  ? "Included automatically"
                  : undefined));
            const originId = `target-origin-${target.id}`;
            const identity = (
              <span className="flex min-w-0 flex-col gap-1 text-left">
                <span className="break-all font-heading text-base font-semibold">
                  {name}
                </span>
                <span className="break-words text-xs text-muted-foreground">
                  {titleOf(target)}
                  {!presetName &&
                    !target.addedByDependency &&
                    targets.some((item) => item.addedByDependency) &&
                    " · Selected directly"}
                </span>
                {origin && (
                  <span
                    id={originId}
                    className="flex items-baseline gap-1.5 text-xs text-muted-foreground"
                  >
                    <CornerDownRight
                      aria-hidden="true"
                      className="size-3 shrink-0 self-start text-primary"
                    />
                    {origin}
                  </span>
                )}
              </span>
            );
            return (
              <li key={target.id}>
                <button
                  ref={(element) =>
                    editor.registerTargetButton(target.id, element)
                  }
                  type="button"
                  aria-expanded={expanded}
                  aria-describedby={origin ? originId : undefined}
                  aria-label={`Configure modules for ${name}, ${target.kind}`}
                  onClick={() => (expanded ? showOverview() : edit(target))}
                  className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-left"
                >
                  {identity}
                  <span className="flex items-center gap-1 text-xs text-primary">
                    Modules
                    <ChevronDown
                      className={cn("size-4", expanded && "rotate-180")}
                    />
                  </span>
                </button>
                {expanded && (
                  <div className="mb-4 border-l-2 border-primary/40 pl-4">
                    <ActiveTargetConfiguration editor={editor} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => {
            selectTarget(undefined);
            setAdding(true);
            requestAnimationFrame(() => chooserHeading.current?.focus());
          }}
        >
          <Plus />
          Add another target
        </Button>
      </div>
    </section>
  );
};
