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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Separator } from "~/components/ui/separator";
import type { BuilderCatalogOutputWire } from "../../../worker/recipe-preview-protocol";
import {
  buildModuleRelationshipNodes,
  targetNameError,
} from "../builder-state";
import type {
  CatalogModule,
  SupportConfiguration,
  SupportSelection,
  TargetInstance,
} from "../use-recipe-builder-state";
import { ModuleBranch } from "./module-branch";

type TargetConfigurationProps = {
  readonly target: TargetInstance;
  readonly targets: ReadonlyArray<TargetInstance>;
  readonly modules: ReadonlyArray<CatalogModule>;
  readonly catalog: BuilderCatalogOutputWire | undefined;
  readonly requiredModuleIds: ReadonlySet<string>;
  readonly dependencySourceNames: ReadonlyArray<string>;
  readonly supportSelections: ReadonlyArray<SupportSelection>;
  readonly rename: (name: string) => void;
  readonly remove: () => void;
  readonly toggleModule: (module: CatalogModule) => void;
  readonly toggleSupportModule: (
    configuration: SupportConfiguration,
    module: CatalogModule,
  ) => void;
};

export function TargetConfiguration({
  target,
  targets,
  modules,
  catalog,
  requiredModuleIds,
  dependencySourceNames,
  supportSelections,
  rename,
  remove,
  toggleModule,
  toggleSupportModule,
}: TargetConfigurationProps) {
  const error = targetNameError(target, targets);
  const targetNameDescriptionId = `target-name-description-${target.id}`;
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
          <Field
            data-invalid={Boolean(error)}
            data-disabled={target.addedByDependency || undefined}
          >
            <FieldLabel htmlFor={`target-name-${target.id}`}>
              Target name
            </FieldLabel>
            <FieldContent>
              <Input
                id={`target-name-${target.id}`}
                value={target.name}
                className="h-11 lg:h-8"
                disabled={target.addedByDependency}
                required
                spellCheck={false}
                onChange={(event) => rename(event.target.value)}
                aria-describedby={targetNameDescriptionId}
                aria-invalid={Boolean(error)}
              />
              {error ? (
                <FieldError id={targetNameDescriptionId}>{error}</FieldError>
              ) : target.addedByDependency ? (
                <FieldDescription id={targetNameDescriptionId}>
                  Set by {dependencySourceNames.join(", ")}.
                </FieldDescription>
              ) : (
                <FieldDescription id={targetNameDescriptionId}>
                  Lowercase letters, numbers, and hyphens; used in paths and
                  package names.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>
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
          <FieldLegend variant="label" className="mb-3">
            Modules
          </FieldLegend>
          <div className="overflow-hidden rounded-md border bg-background">
            {roots.map((module, index) => (
              <ModuleBranch
                key={module.id}
                module={module}
                modules={modules}
                selected={target.modules}
                toggleModule={toggleModule}
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
                supportSelections={supportSelections}
                toggleSupportModule={toggleSupportModule}
                {...(requiredModuleIds.has(module.id)
                  ? { requirement: "required" as const }
                  : {})}
              />
            ))}
          </div>
        </FieldSet>
      )}
      <div className="mt-6 flex flex-col items-end gap-5">
        <Separator />
        <Button
          variant="destructive"
          className="h-11 lg:h-8"
          aria-label={
            target.requirements?.length
              ? `Remove ${target.name} and dependent selections`
              : `Remove ${target.name}`
          }
          onClick={remove}
        >
          <Trash2 data-icon="inline-start" />
          Remove target
        </Button>
      </div>
    </section>
  );
}
