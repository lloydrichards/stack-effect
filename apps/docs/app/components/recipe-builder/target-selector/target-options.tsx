import { TargetIdentity } from "@repo/domain/Catalog";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { RecipeBuilderCatalog } from "../../../workers/recipe-builder/domain";
import { CatalogSourceBadge } from "../catalog-sources";
import type { TargetInstance } from "../form";
import { nextTargetName } from "./state";

type TargetOptionsProps = {
  readonly instances: ReadonlyArray<TargetInstance>;
  readonly onAddTarget: (kind: string) => void;
  readonly targets: RecipeBuilderCatalog["targets"] | undefined;
  readonly catalogFailed: boolean;
};

export const AddTargetPicker = ({
  targets,
  instances,
  onAddTarget,
  catalogFailed,
}: TargetOptionsProps) => {
  const [kind, setKind] = useState("");
  const choice = targets?.find((target) => target.kind === kind);
  if (catalogFailed) return null;
  if (!targets)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading target types…
      </p>
    );
  if (!targets.length)
    return (
      <p className="text-sm text-muted-foreground">
        The selected catalogs have no application targets.
      </p>
    );
  const owner =
    choice &&
    new TargetIdentity({
      kind: choice.kind,
      name: nextTargetName(
        choice.defaultName ?? choice.kind,
        instances,
        choice.kind,
      ),
    });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) onAddTarget(choice.kind);
      }}
    >
      <fieldset className="divide-y border-y">
        <legend className="sr-only">Target type</legend>
        {targets.map((target) => (
          <label
            key={target.kind}
            className="flex min-h-11 cursor-pointer items-start gap-3 px-2 py-3 text-sm hover:bg-muted/30 has-checked:bg-muted/40"
          >
            <input
              type="radio"
              className="mt-1 accent-primary"
              name="target-kind"
              value={target.kind}
              checked={kind === target.kind}
              onChange={() => setKind(target.kind)}
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {target.title}
                <CatalogSourceBadge source={target.source} />
              </span>
              {target.kind === kind && (
                <span className="mt-1 block leading-5 text-muted-foreground">
                  {target.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!choice}>
          <Plus />
          Add target
        </Button>
        <span
          aria-live="polite"
          className="break-all font-mono text-xs text-muted-foreground"
        >
          {owner?.toPath()}
        </span>
      </div>
    </form>
  );
};
