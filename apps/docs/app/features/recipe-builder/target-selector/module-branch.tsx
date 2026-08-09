import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { cn } from "~/lib/utils";
import { type ModuleRelationshipNode, ownerKey } from "../builder-state";
import { useRecipeBuilder } from "../recipe-builder-context";
import type { CatalogModule } from "../recipe-builder-form";
import { RelationshipBranch } from "./relationship-branch";

type ModuleBranchProps = {
  readonly module: CatalogModule;
  readonly modules: ReadonlyArray<CatalogModule>;
  readonly selected: ReadonlyArray<string>;
  readonly relationships?: ReadonlyArray<ModuleRelationshipNode>;
  readonly divided?: boolean;
  readonly requirement?: "required" | "optional";
};

export function ModuleBranch({
  module,
  modules,
  selected,
  relationships = [],
  divided = false,
  requirement,
}: ModuleBranchProps) {
  const {
    actions: { toggleModule },
  } = useRecipeBuilder();
  const parentSelected = selected.includes(module.id);
  const required = requirement === "required";
  const checked = required || parentSelected;
  return (
    <div className={cn(divided && "border-t")}>
      <Field
        orientation="horizontal"
        data-disabled={required}
        className={cn(
          "min-h-16 items-center px-4 py-2.5 transition-colors hover:bg-muted/40",
          checked && "bg-muted/25",
        )}
      >
        <Checkbox
          id={`module-${module.id}`}
          checked={checked}
          disabled={required}
          onCheckedChange={() => toggleModule(module)}
        />
        <FieldLabel
          htmlFor={`module-${module.id}`}
          className={cn(
            "min-w-0 flex-1 flex-col items-start gap-1",
            !required && "cursor-pointer",
          )}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm/5 font-medium text-foreground">
              {module.title}
            </span>
            {requirement ? (
              <span className="text-xs font-normal text-muted-foreground">
                {requirement}
              </span>
            ) : null}
          </span>
          <span className="max-w-3xl text-sm/5 font-normal text-muted-foreground">
            {module.description}
          </span>
        </FieldLabel>
      </Field>
      {checked && module.children.length > 0 ? (
        <div className="border-t bg-muted/15 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Included modules
          </p>
          <FieldGroup
            data-slot="checkbox-group"
            className="mt-2 gap-0 border-l pl-3"
          >
            {module.children.map((child) => {
              const childModule = modules.find(
                (candidate) => candidate.id === child.moduleId,
              );
              return childModule ? (
                <ModuleBranch
                  key={child.moduleId}
                  module={childModule}
                  modules={modules}
                  selected={selected}
                  requirement={child.requirement}
                />
              ) : null;
            })}
          </FieldGroup>
        </div>
      ) : null}
      {checked && relationships.length > 0 ? (
        <div className="border-t bg-muted/15 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Added to the Blueprint
          </p>
          <FieldGroup
            data-slot="checkbox-group"
            className="mt-2 gap-0 border-l pl-3"
          >
            {relationships.map((relationship) => (
              <RelationshipBranch
                key={`${ownerKey(relationship.owner)}#${relationship.module.id}`}
                node={relationship}
              />
            ))}
          </FieldGroup>
        </div>
      ) : null}
    </div>
  );
}
