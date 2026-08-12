import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { cn } from "~/lib/utils";
import { CatalogModule } from "../../../workers/recipe-builder/domain";
import {
  ownerKey,
  type SupportConfiguration,
  type SupportSelection,
} from "../form";
import { RelationshipBranch } from "./relationship-branch";
import type { ModuleRelationshipNode } from "./state";

type ModuleBranchProps = {
  readonly module: typeof CatalogModule.Type;
  readonly modules: ReadonlyArray<typeof CatalogModule.Type>;
  readonly selected: ReadonlyArray<string>;
  readonly relationships?: ReadonlyArray<ModuleRelationshipNode>;
  readonly divided?: boolean;
  readonly onToggleModule: (module: typeof CatalogModule.Type) => void;
  readonly onToggleSupportModule: (
    configuration: SupportConfiguration,
    moduleId: string,
  ) => void;
  readonly requirement?: "required" | "optional";
  readonly supportSelections: ReadonlyArray<SupportSelection>;
};

export function ModuleBranch({
  module,
  modules,
  selected,
  relationships = [],
  divided = false,
  onToggleModule,
  onToggleSupportModule,
  requirement,
  supportSelections,
}: ModuleBranchProps) {
  const parentSelected = selected.includes(module.id);
  const required = requirement === "required";
  const checked = required || parentSelected;
  return (
    <div className={cn(divided && "border-t")}>
      <Field
        orientation="horizontal"
        variant="selection"
        density="comfortable"
        data-disabled={required}
        data-selected={checked}
      >
        <Checkbox
          id={`module-${module.id}`}
          checked={checked}
          disabled={required}
          onCheckedChange={() => onToggleModule(module)}
        />
        <FieldLabel
          htmlFor={`module-${module.id}`}
          className={cn(!required && "cursor-pointer")}
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
            variant="branch"
            className="mt-2"
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
                  onToggleModule={onToggleModule}
                  onToggleSupportModule={onToggleSupportModule}
                  selected={selected}
                  requirement={child.requirement}
                  supportSelections={supportSelections}
                />
              ) : null;
            })}
          </FieldGroup>
        </div>
      ) : null}
      {checked && relationships.length > 0 ? (
        <div className="border-t bg-muted/15 px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">
            Required dependencies
          </p>
          <FieldGroup
            data-slot="checkbox-group"
            variant="branch"
            className="mt-2"
          >
            {relationships.map((relationship) => (
              <RelationshipBranch
                key={`${ownerKey(relationship.owner)}#${relationship.module.id}`}
                node={relationship}
                onToggleSupportModule={onToggleSupportModule}
                supportSelections={supportSelections}
              />
            ))}
          </FieldGroup>
        </div>
      ) : null}
    </div>
  );
}
