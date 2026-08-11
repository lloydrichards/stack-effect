import { Trash2 } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import type {
  SupportConfiguration,
  SupportSelection,
  TargetInstance,
} from "../form";
import { ownerKey } from "../form";
import { useRecipeBuilderFormContext } from "../recipe-builder-context";
import { CatalogModule, RecipeBuilderCatalog } from "../worker/domain";
import { ModuleBranch } from "./module-branch";
import { buildModuleRelationshipNodes, dependencySourceNames } from "./state";

type TargetConfigurationProps = {
  readonly catalog: typeof RecipeBuilderCatalog.Type | undefined;
  readonly onRemoveTarget: (id: string) => void;
  readonly onToggleModule: (module: typeof CatalogModule.Type) => void;
  readonly onToggleSupportModule: (
    configuration: SupportConfiguration,
    moduleId: string,
  ) => void;
  readonly supportSelections: ReadonlyArray<SupportSelection>;
  readonly target: TargetInstance;
  readonly targetIndex: number;
  readonly targets: ReadonlyArray<TargetInstance>;
};

export function TargetConfiguration({
  catalog,
  onRemoveTarget,
  onToggleModule,
  onToggleSupportModule,
  supportSelections,
  target,
  targetIndex,
  targets,
}: TargetConfigurationProps) {
  const form = useRecipeBuilderFormContext();
  const modules =
    catalog?.targetModules.find(
      (entry) => ownerKey(entry.owner) === ownerKey(target),
    )?.modules ?? [];
  const targetNameDescriptionId = `target-name-description-${target.id}`;
  const nameLocked = (target.requirements?.length ?? 0) > 0;
  const targetNameDescription = nameLocked
    ? `Set by ${dependencySourceNames(target, targets).join(", ")}.`
    : target.name.length === 0
      ? "Optional; leave blank to use the target kind for its path and package name."
      : "Lowercase letters, numbers, and hyphens; used in paths and package names.";
  const childIds = new Set(
    modules.flatMap((module) => module.children.map((child) => child.moduleId)),
  );
  const roots = modules.filter(
    (module) => module.visibility === "public" && !childIds.has(module.id),
  );
  const requiredModuleIds = new Set([
    ...(target.requirements?.map((requirement) => requirement.moduleId) ?? []),
    ...(catalog?.targets.find((definition) => definition.kind === target.kind)
      ?.requiredModules ?? []),
  ]);
  return (
    <section className="p-5 md:p-7">
      <div className="border-b pb-5">
        <FieldGroup>
          <form.Field
            name={`targets[${targetIndex}].name`}
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field
                  data-invalid={isInvalid}
                  data-disabled={nameLocked || undefined}
                >
                  <FieldLabel htmlFor={`target-name-${target.id}`}>
                    Target name
                  </FieldLabel>
                  <Input
                    id={`target-name-${target.id}`}
                    name={field.name}
                    value={field.state.value}
                    disabled={nameLocked}
                    spellCheck={false}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-describedby={targetNameDescriptionId}
                    aria-invalid={isInvalid}
                  />
                  <FieldDescription id={targetNameDescriptionId}>
                    {targetNameDescription}
                  </FieldDescription>
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
        </FieldGroup>
      </div>
      {modules.length === 0 ? (
        <Empty className="min-h-48">
          <EmptyHeader>
            <EmptyTitle>No modules support this target identity</EmptyTitle>
            <EmptyDescription>
              Some package modules require a canonical name such as package/ai.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <FieldSet className="mt-5 max-w-5xl gap-4">
          <FieldLegend variant="label">Modules</FieldLegend>
          <FieldGroup data-slot="checkbox-group" variant="outlined">
            {roots.map((module, index) => (
              <ModuleBranch
                key={module.id}
                module={module}
                modules={modules}
                selected={target.modules}
                divided={index > 0}
                onToggleModule={onToggleModule}
                onToggleSupportModule={onToggleSupportModule}
                relationships={
                  target.modules.includes(module.id) ||
                  requiredModuleIds.has(module.id)
                    ? buildModuleRelationshipNodes(
                        module,
                        { kind: target.kind, name: target.name },
                        catalog,
                      )
                    : []
                }
                supportSelections={supportSelections}
                {...(requiredModuleIds.has(module.id)
                  ? { requirement: "required" as const }
                  : {})}
              />
            ))}
          </FieldGroup>
        </FieldSet>
      )}
      <div className="mt-6 flex flex-col items-end gap-5">
        <Separator />
        <Button
          variant="destructive"
          aria-label={
            target.requirements?.length
              ? `Remove ${target.name} and dependent selections`
              : `Remove ${target.name}`
          }
          onClick={() => onRemoveTarget(target.id)}
        >
          <Trash2 data-icon="inline-start" />
          Remove target
        </Button>
      </div>
    </section>
  );
}
