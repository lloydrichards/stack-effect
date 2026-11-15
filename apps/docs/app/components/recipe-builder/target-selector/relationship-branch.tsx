import {
  ownerKey,
  type SupportConfiguration,
  type SupportSelection,
} from "../form";
import { ModuleDetails } from "./module-details";
import { ModuleRow } from "./module-row";
import { type ModuleRelationshipNode, supportConfigurationKey } from "./state";

type RelationshipBranchProps = {
  readonly disabled?: boolean;
  readonly node: ModuleRelationshipNode;
  readonly onToggleSupportModule: (
    configuration: SupportConfiguration,
    moduleId: string,
  ) => void;
  readonly supportSelections: ReadonlyArray<SupportSelection>;
};

export function RelationshipBranch({
  disabled: parentDisabled = false,
  node,
  onToggleSupportModule,
  supportSelections,
}: RelationshipBranchProps) {
  const required = node.requirement === "required";
  const configuration = node.configuration;
  const selected = configuration
    ? (supportSelections
        .find(
          (selection) =>
            supportConfigurationKey(selection) ===
            supportConfigurationKey(configuration),
        )
        ?.selected.includes(node.module.id) ?? false)
    : false;
  const checked = required || selected;
  const disabled = parentDisabled || required || configuration === undefined;
  return (
    <li>
      <ModuleRow
        required={required}
        checked={checked}
        disabled={disabled}
        onToggle={() =>
          configuration && onToggleSupportModule(configuration, node.module.id)
        }
        details={
          <ModuleDetails
            title={node.module.title}
            description={node.module.description}
            requirement={node.requirement}
            target={ownerKey(node.owner)}
          />
        }
      >
        <span>{node.module.title}</span>
      </ModuleRow>
      {checked && node.children.length > 0 && (
        <ul
          className="module-tree ml-2"
          aria-label={`Dependencies of ${node.module.title}`}
        >
          {node.children.map((child) => (
            <RelationshipBranch
              key={`${ownerKey(child.owner)}#${child.module.id}`}
              node={child}
              disabled={parentDisabled}
              onToggleSupportModule={onToggleSupportModule}
              supportSelections={supportSelections}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
