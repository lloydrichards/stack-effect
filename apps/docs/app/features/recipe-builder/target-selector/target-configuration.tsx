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
import { buildModuleRelationshipNodes } from "../builder-state";
import { useRecipeBuilder } from "../recipe-builder-context";
import { ModuleBranch } from "./module-branch";

type TargetConfigurationProps = {
  readonly targetIndex: number;
  readonly targetId: string;
};

export function TargetConfiguration({
  targetIndex,
  targetId,
}: TargetConfigurationProps) {
  const {
    state: {
      activeModules: modules,
      catalog,
      dependencySourceNames,
      form,
      requiredModuleIds,
      targets,
    },
    actions: { removeTarget },
  } = useRecipeBuilder();
  const target = targets.find((candidate) => candidate.id === targetId);
  if (!target) return null;

  const targetNameDescriptionId = `target-name-description-${target.id}`;
  const targetNameDescription = target.addedByDependency
    ? `Set by ${dependencySourceNames.join(", ")}.`
    : "Lowercase letters, numbers, and hyphens; used in paths and package names.";
  const childIds = new Set(
    modules.flatMap((module) => module.children.map((child) => child.moduleId)),
  );
  const roots = modules.filter(
    (module) => module.visibility === "public" && !childIds.has(module.id),
  );
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
                  data-disabled={target.addedByDependency || undefined}
                >
                  <FieldLabel htmlFor={`target-name-${target.id}`}>
                    Target name
                  </FieldLabel>
                  <Input
                    id={`target-name-${target.id}`}
                    name={field.name}
                    value={field.state.value}
                    disabled={target.addedByDependency}
                    required
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
          onClick={() => removeTarget(target.id)}
        >
          <Trash2 data-icon="inline-start" />
          Remove target
        </Button>
      </div>
    </section>
  );
}
