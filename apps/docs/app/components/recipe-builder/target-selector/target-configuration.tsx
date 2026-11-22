import type { TargetIdentity } from "@repo/domain/Catalog";
import { useSelector } from "@tanstack/react-form";
import { LockKeyhole, Square, Trash2 } from "lucide-react";
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
import {
  CatalogModule,
  RecipeBuilderCatalog,
} from "../../../workers/recipe-builder/domain";
import type {
  SupportConfiguration,
  SupportSelection,
  TargetInstance,
} from "../form";
import { ownerKey } from "../form";
import { usePresetTargets } from "../preset-targets";
import { useRecipeBuilderFormContext } from "../recipe-builder-context";
import { ModuleBranch } from "./module-branch";
import {
  buildModuleRelationshipNodes,
  dependencySourceNames,
  moduleRequiresCapability,
  publicRootModules,
} from "./state";
import type { useTargetEditor } from "./use-target-editor";

type TargetConfigurationProps = {
  readonly catalog: typeof RecipeBuilderCatalog.Type | undefined;
  readonly catalogFailed: boolean;
  readonly presetName: string | undefined;
  readonly catalogOwner: TargetIdentity | undefined;
  readonly onRemoveTarget: (id: string) => void;
  readonly onToggleModule: (module: typeof CatalogModule.Type) => void;
  readonly onToggleSupportModule: (
    configuration: SupportConfiguration,
    moduleId: string,
  ) => void;
  readonly requiredModules: ReadonlyArray<string> | undefined;
  readonly supportSelections: ReadonlyArray<SupportSelection>;
  readonly target: TargetInstance;
  readonly targetIndex: number;
  readonly targets: ReadonlyArray<TargetInstance>;
};

function TargetConfiguration({
  catalog,
  catalogFailed,
  presetName,
  catalogOwner,
  onRemoveTarget,
  onToggleModule,
  onToggleSupportModule,
  requiredModules,
  supportSelections,
  target,
  targetIndex,
  targets,
}: TargetConfigurationProps) {
  const form = useRecipeBuilderFormContext();
  const runtime = useSelector(
    form.store,
    (state) => state.values.config.runtime._tag,
  );
  const database = useSelector(form.store, (state) => state.values.database);
  const modules =
    catalog?.targetModules.find(
      (entry) => ownerKey(entry.owner) === ownerKey(catalogOwner ?? target),
    )?.modules ?? [];
  const targetNameDescriptionId = `target-name-description-${target.id}`;
  const nameLocked = (target.requirements?.length ?? 0) > 0;
  const targetNameDescription = nameLocked
    ? `Set by ${dependencySourceNames(target, targets).join(", ")}.`
    : target.name.length === 0
      ? "Leave blank to use the target kind."
      : "Use / for nested folders, such as sdk/web.";
  const presetTargets = usePresetTargets();
  const presetModules = presetTargets.flatMap(({ targets }) =>
    targets
      .filter(({ identity }) => ownerKey(identity) === ownerKey(target))
      .flatMap(({ modules }) => modules.map(({ id }) => id)),
  );
  const roots = publicRootModules(modules);
  const isDatabaseTarget = ownerKey(target) === "package/db";
  const requiredModuleIds = new Set([
    ...presetModules,
    ...(isDatabaseTarget && database !== "none"
      ? [`package-db-${database}`]
      : []),
    ...(requiredModules ?? []),
    ...(target.requirements?.map((requirement) => requirement.moduleId) ?? []),
    ...(catalog?.targets.find((definition) => definition.kind === target.kind)
      ?.requiredModules ?? []),
  ]);
  const moduleOwner = catalogOwner ?? {
    kind: target.kind,
    name: target.name,
  };
  const getDisabledReason = (module: typeof CatalogModule.Type) => {
    if (
      isDatabaseTarget &&
      (module.id === "package-db-sqlite" ||
        module.id === "package-db-postgres") &&
      module.id !== `package-db-${database}`
    ) {
      return "Choose the SQL provider in Project setup.";
    }
    if (
      module.supportedRuntimes &&
      !module.supportedRuntimes.includes(runtime)
    ) {
      return `Supported runtimes: ${module.supportedRuntimes.join(", ")}.`;
    }
    const conflict = presetTargets.find(({ targets }) =>
      targets.some(({ modules }) =>
        modules.some(({ id }) => module.conflictsWith?.includes(id)),
      ),
    );
    if (conflict) return `Conflicts with ${conflict.preset.title}.`;
    return database === "none" &&
      moduleRequiresCapability(module, moduleOwner, "db-sql", catalog)
      ? "Select a database to enable this module."
      : undefined;
  };
  const nameField = (
    <div className="group/name">
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
                <FieldDescription
                  id={targetNameDescriptionId}
                  className={
                    nameLocked
                      ? undefined
                      : "sr-only group-focus-within/name:not-sr-only"
                  }
                >
                  {targetNameDescription}
                </FieldDescription>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
      </FieldGroup>
    </div>
  );
  const removeButton = (
    <div className="mt-3 flex justify-end">
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
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
  );
  return (
    <section className="pt-1">
      {roots.length === 0 ? (
        <Empty className="min-h-48">
          <EmptyHeader>
            <EmptyTitle>No modules support this target identity</EmptyTitle>
            <EmptyDescription>
              Some package modules require a canonical name such as package/ai.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <FieldSet className="gap-1" disabled={catalogFailed}>
          <FieldLegend
            variant="label"
            className="flex w-full flex-wrap items-center justify-between gap-2"
          >
            Modules
            <span className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <LockKeyhole aria-hidden="true" className="size-3" />
                Included automatically
              </span>
              <span className="inline-flex items-center gap-1">
                <Square aria-hidden="true" className="size-3" />
                Optional
              </span>
            </span>
          </FieldLegend>
          <FieldGroup
            data-slot="checkbox-group"
            className="divide-y border-y data-[slot=checkbox-group]:gap-0"
          >
            {roots.map((module) => (
              <div key={module.id} className="px-2">
                <ModuleBranch
                  module={module}
                  modules={modules}
                  disabled={catalogFailed}
                  getDisabledReason={getDisabledReason}
                  selected={target.modules}
                  onToggleModule={onToggleModule}
                  onToggleSupportModule={onToggleSupportModule}
                  relationships={
                    target.modules.includes(module.id) ||
                    requiredModuleIds.has(module.id)
                      ? buildModuleRelationshipNodes(
                          module,
                          moduleOwner,
                          catalog,
                        )
                      : []
                  }
                  supportSelections={supportSelections}
                  {...(requiredModuleIds.has(module.id)
                    ? { requirement: "required" as const }
                    : {})}
                />
              </div>
            ))}
          </FieldGroup>
        </FieldSet>
      )}

      {presetName === undefined && targetIndex >= 0 && (
        <details className="mt-3 border-t pt-2">
          <summary className="w-fit cursor-pointer py-2 text-xs font-medium text-muted-foreground">
            Target settings
          </summary>
          {nameField}
          {removeButton}
        </details>
      )}
    </section>
  );
}

export function ActiveTargetConfiguration({
  editor,
}: {
  editor: ReturnType<typeof useTargetEditor>;
}) {
  const target = editor.activeTarget;
  if (!target) return null;
  return (
    <TargetConfiguration
      key={target.id}
      catalog={editor.catalog}
      catalogFailed={editor.catalogFailed}
      catalogOwner={editor.catalogOwnersByTargetId.get(target.id)}
      onRemoveTarget={editor.removeTarget}
      onToggleModule={editor.toggleModule}
      onToggleSupportModule={editor.toggleSupportModule}
      requiredModules={editor.activeRequiredModules}
      supportSelections={editor.supportSelections}
      target={target}
      targetIndex={editor.activeTargetIndex}
      presetName={editor.presetNames.get(ownerKey(target))}
      targets={editor.targets}
    />
  );
}
