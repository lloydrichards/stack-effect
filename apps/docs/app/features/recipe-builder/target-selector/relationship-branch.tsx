import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { cn } from "~/lib/utils";
import {
  type ModuleRelationshipNode,
  ownerKey,
  supportConfigurationKey,
} from "../builder-state";
import { useRecipeBuilder } from "../recipe-builder-context";

type RelationshipBranchProps = {
  readonly node: ModuleRelationshipNode;
};

export function RelationshipBranch({ node }: RelationshipBranchProps) {
  const {
    state: { supportSelections },
    actions: { toggleSupportModule },
  } = useRecipeBuilder();
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
  const disabled = required || configuration === undefined;
  const id = `relationship-${ownerKey(node.owner)}-${node.module.id}`;
  return (
    <div className="relative">
      <Field
        orientation="horizontal"
        variant="selection"
        density="compact"
        data-disabled={disabled}
        data-selected={checked}
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={() =>
            configuration && toggleSupportModule(configuration, node.module)
          }
        />
        <FieldLabel
          htmlFor={id}
          className={cn(
            !required && configuration !== undefined && "cursor-pointer",
          )}
        >
          <span className="text-sm/5 text-foreground">{node.module.title}</span>
          <span className="break-all font-mono text-xs/5 font-normal text-muted-foreground sm:break-normal">
            {node.owner.kind}/{node.owner.name} · {node.requirement}
          </span>
        </FieldLabel>
      </Field>
      {checked && node.children.length > 0 ? (
        <FieldGroup
          data-slot="checkbox-group"
          variant="branch"
          className="ml-2"
        >
          {node.children.map((child) => (
            <RelationshipBranch
              key={`${ownerKey(child.owner)}#${child.module.id}`}
              node={child}
            />
          ))}
        </FieldGroup>
      ) : null}
    </div>
  );
}
