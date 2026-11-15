import { CatalogModule } from "../../../workers/recipe-builder/domain";
import { CatalogSourceBadge } from "../catalog-sources";
import {
  ownerKey,
  type SupportConfiguration,
  type SupportSelection,
} from "../form";
import { ModuleDetails } from "./module-details";
import { ModuleRow } from "./module-row";
import { RelationshipBranch } from "./relationship-branch";
import type { ModuleRelationshipNode } from "./state";

type ModuleBranchProps = {
  readonly module: typeof CatalogModule.Type;
  readonly modules: ReadonlyArray<typeof CatalogModule.Type>;
  readonly selected: ReadonlyArray<string>;
  readonly relationships?: ReadonlyArray<ModuleRelationshipNode>;
  readonly disabled?: boolean;
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
  disabled = false,
  getDisabledReason,
  onToggleModule,
  onToggleSupportModule,
  requirement,
  supportSelections,
}: ModuleBranchProps) {
  const parentSelected = selected.includes(module.id);
  const required = requirement === "required";
  const checked = required || parentSelected;
  const disabledReason = getDisabledReason?.(module);
  const unavailable = disabled || (!checked && disabledReason !== undefined);
  return (
    <>
      <ModuleRow
        required={required}
        checked={checked}
        disabled={unavailable}
        onToggle={() => onToggleModule(module)}
        reason={disabledReason}
        details={
          <ModuleDetails
            title={module.title}
            description={module.description}
          />
        }
      >
        <span>{module.title}</span>{" "}
        <CatalogSourceBadge source={module.source} />
      </ModuleRow>
      {checked && (module.children.length > 0 || relationships.length > 0) && (
        <ul
          aria-label={`Dependencies of ${module.title}`}
          className="module-tree ml-2"
        >
          {module.children.map((child) => {
            const childModule = modules.find(
              (candidate) => candidate.id === child.moduleId,
            );
            return childModule ? (
              <li key={child.moduleId}>
                <ModuleBranch
                  module={childModule}
                  modules={modules}
                  disabled={disabled}
                  getDisabledReason={getDisabledReason}
                  onToggleModule={onToggleModule}
                  onToggleSupportModule={onToggleSupportModule}
                  selected={selected}
                  requirement={child.requirement}
                  supportSelections={supportSelections}
                />
              </li>
            ) : null;
          })}
          {relationships.map((relationship) => (
            <RelationshipBranch
              key={`${ownerKey(relationship.owner)}#${relationship.module.id}`}
              node={relationship}
              disabled={disabled}
              onToggleSupportModule={onToggleSupportModule}
              supportSelections={supportSelections}
            />
          ))}
        </ul>
      )}
    </>
  );
}
