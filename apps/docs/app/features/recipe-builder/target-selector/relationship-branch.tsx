import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldLabel } from "~/components/ui/field";
import { cn } from "~/lib/utils";
import {
  type ModuleRelationshipNode,
  ownerKey,
  supportConfigurationKey,
} from "../builder-state";
import type {
  CatalogModule,
  SupportConfiguration,
  SupportSelection,
} from "../use-recipe-builder-state";

type RelationshipBranchProps = {
  readonly node: ModuleRelationshipNode;
  readonly supportSelections: ReadonlyArray<SupportSelection>;
  readonly toggleSupportModule?: (
    configuration: SupportConfiguration,
    module: CatalogModule,
  ) => void;
};

export function RelationshipBranch({
  node,
  supportSelections,
  toggleSupportModule,
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
  const id = `relationship-${ownerKey(node.owner)}-${node.module.id}`;
  return (
    <div className="relative">
      <Field
        orientation="horizontal"
        className="min-h-11 items-center gap-3 py-1.5"
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={required || configuration === undefined}
          onCheckedChange={() =>
            configuration && toggleSupportModule?.(configuration, node.module)
          }
        />
        <FieldLabel
          htmlFor={id}
          className={cn(
            "min-w-0 flex-1 flex-col items-start gap-0.5",
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
        <div className="ml-2 border-l pl-3">
          {node.children.map((child) => (
            <RelationshipBranch
              key={`${ownerKey(child.owner)}#${child.module.id}`}
              node={child}
              supportSelections={supportSelections}
              {...(toggleSupportModule ? { toggleSupportModule } : {})}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
