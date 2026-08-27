"use client";

import { useSelector } from "@tanstack/react-form";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Field, FieldDescription, FieldLabel } from "~/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { dddProviderModules } from "./form";
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
  const architecture = useSelector(
    form.store,
    (state) => state.values.architecture,
  );
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
  const todoApi = targets.find(
    ({ kind, name }) => kind === "server" && name === "api",
  );
  const selectedProviders = dddProviderModules.filter((module) =>
    todoApi?.modules.includes(module),
  );

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
          {architecture === "ddd" ? (
            <ToggleGroup
              aria-labelledby="database-provider-label"
              multiple
              value={[...selectedProviders]}
              variant="outline"
              className="grid w-full grid-cols-2"
              onValueChange={(values) => {
                if (!todoApi) return;
                form.setFieldValue(
                  "targets",
                  targets.map((target) =>
                    target.id === todoApi.id
                      ? {
                          ...target,
                          modules: [
                            ...target.modules.filter(
                              (module) =>
                                !dddProviderModules.includes(module as never),
                            ),
                            ...dddProviderModules.filter((module) =>
                              values.includes(module),
                            ),
                          ],
                        }
                      : target,
                  ),
                );
              }}
            >
              <ToggleGroupItem
                value={dddProviderModules[0]}
                disabled={!todoApi}
              >
                SQLite
              </ToggleGroupItem>
              <ToggleGroupItem
                value={dddProviderModules[1]}
                disabled={!todoApi}
              >
                PostgreSQL
              </ToggleGroupItem>
            </ToggleGroup>
          ) : (
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
                )
                  form.setFieldValue("database", value);
              }}
            >
              {choices.map((choice) => (
                <ToggleGroupItem
                  key={choice.value}
                  value={choice.value}
                  disabled={choice.value === "none" && databaseRequired}
                >
                  {choice.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
          <FieldDescription>
            {architecture === "ddd"
              ? todoApi
                ? "Memory is always included and is the default. Durable providers are additive."
                : "Memory is always included. Add server/api to select durable providers."
              : databaseRequirementMessage}
          </FieldDescription>
        </Field>
      </div>
    </DisclosurePanel>
  );
}
