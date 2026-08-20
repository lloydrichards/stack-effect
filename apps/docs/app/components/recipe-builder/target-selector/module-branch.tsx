import { Checkbox } from "~/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
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
  readonly disabled?: boolean;
  readonly disabledReason?: string | undefined;
  readonly getDisabledReason?:
    | ((module: typeof CatalogModule.Type) => string | undefined)
    | undefined;
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
  disabled = false,
  disabledReason,
  getDisabledReason,
  onToggleModule,
  onToggleSupportModule,
  requirement,
  supportSelections,
}: ModuleBranchProps) {
  const parentSelected = selected.includes(module.id);
  const required = requirement === "required";
  const checked = required || parentSelected;
  const unavailable = disabled || (!checked && disabledReason !== undefined);
  const disabledReasonId = `module-${module.id}-disabled-reason`;
  return (
    <div className={cn(divided && "border-t")}>
      <Field
        orientation="horizontal"
        variant="selection"
        density="comfortable"
        data-disabled={required || unavailable}
        data-selected={checked}
      >
        <Checkbox
          id={`module-${module.id}`}
          checked={checked}
          disabled={required || unavailable}
          aria-describedby={disabledReason ? disabledReasonId : undefined}
          onCheckedChange={() => onToggleModule(module)}
        />
        <FieldContent>
          <FieldLabel
            htmlFor={`module-${module.id}`}
            className={cn(
              "w-full",
              !required && !unavailable && "cursor-pointer",
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
          {disabledReason ? (
            <p
              id={disabledReasonId}
              className="mt-1 max-w-3xl text-xs/5 font-medium text-foreground/80"
            >
              {disabledReason}
            </p>
          ) : null}
        </FieldContent>
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
                  disabled={disabled}
                  getDisabledReason={getDisabledReason}
                  {...(getDisabledReason?.(childModule) === undefined
                    ? {}
                    : { disabledReason: getDisabledReason(childModule) })}
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
                disabled={disabled}
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
