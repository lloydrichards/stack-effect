"use client";

import { useSelector } from "@tanstack/react-form";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
} from "./recipe-builder-context";
import { moduleRequiresCapability } from "./target-selector/state";

const choices = [
  { value: "none", label: "None" },
  { value: "sqlite", label: "SQLite" },
  { value: "postgres", label: "Postgres" },
] as const;

const moduleTitleList = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

export function DatabaseSelector() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogOwnersByTargetId } = useRecipeBuilderCatalog();
  const database = useSelector(form.store, (state) => state.values.database);
  const targets = useSelector(form.store, (state) => state.values.targets);
  const selectedModules = targets.flatMap((target) => {
    const owner = catalogOwnersByTargetId.get(target.id) ?? target;
    const modules = catalog?.targetModules.find(
      (entry) =>
        entry.owner.kind === owner.kind && entry.owner.name === owner.name,
    )?.modules;

    return target.modules.flatMap((moduleId) => {
      const module = modules?.find(({ id }) => id === moduleId);
      return module === undefined ? [] : [{ target, owner, module }];
    });
  });
  const impliedModuleKeys = new Set(
    selectedModules.flatMap(({ module }) =>
      module.implies.flatMap(({ targetKind, moduleId }) => {
        const matchingTargets = targets.filter(
          ({ kind }) => kind === targetKind,
        );
        return matchingTargets.length === 1
          ? [`${matchingTargets[0]?.id}#${moduleId}`]
          : [];
      }),
    ),
  );
  const databaseRequirementTitles = Array.from(
    new Set(
      selectedModules.flatMap(({ target, owner, module }) => {
        const dependencyAddedModuleIds = new Set(
          target.requirements
            ?.filter(({ addedModule }) => addedModule)
            .map(({ moduleId }) => moduleId),
        );
        return !dependencyAddedModuleIds.has(module.id) &&
          !impliedModuleKeys.has(`${target.id}#${module.id}`) &&
          moduleRequiresCapability(module, owner, "db-sql", catalog)
          ? [module.title]
          : [];
      }),
    ),
  );
  const databaseRequired = databaseRequirementTitles.length > 0;
  const databaseRequirementMessage = databaseRequired
    ? `Remove ${moduleTitleList.format(databaseRequirementTitles)} to choose None.`
    : "Database-backed modules become available after you select a database.";
  const selectedLabel = choices.find(({ value }) => value === database)?.label;

  return (
    <DisclosurePanel
      title="Database"
      description="Choose the SQL provider shared by database-backed features."
      defaultOpen
      meta={
        <span className="font-mono text-xs text-muted-foreground">
          {database === "none" ? "Not configured" : selectedLabel}
        </span>
      }
    >
      <div className="p-4 md:p-5">
        <Field>
          <FieldLabel id="database-provider-label">SQL provider</FieldLabel>
          <ToggleGroup
            aria-labelledby="database-provider-label"
            value={[database]}
            variant="outline"
            className="grid w-full grid-cols-3"
            onValueChange={(values) => {
              const value = values[0] ?? database;
              if (
                value === "none" ||
                value === "sqlite" ||
                value === "postgres"
              ) {
                form.setFieldValue("database", value);
              }
            }}
          >
            {choices.map((choice) => (
              <ToggleGroupItem
                key={choice.value}
                value={choice.value}
                className="w-full"
                disabled={choice.value === "none" && databaseRequired}
              >
                {choice.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <FieldDescription>{databaseRequirementMessage}</FieldDescription>
        </Field>
      </div>
    </DisclosurePanel>
  );
}
