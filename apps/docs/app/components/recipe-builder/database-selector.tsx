"use client";

import { useSelector } from "@tanstack/react-form";
import { Database } from "lucide-react";
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

export function DatabaseSelector() {
  const form = useRecipeBuilderFormContext();
  const { catalog, catalogOwnersByTargetId } = useRecipeBuilderCatalog();
  const database = useSelector(form.store, (state) => state.values.database);
  const targets = useSelector(form.store, (state) => state.values.targets);
  const databaseRequired = targets.some((target) => {
    const owner = catalogOwnersByTargetId.get(target.id) ?? target;
    const modules = catalog?.targetModules.find(
      (entry) =>
        entry.owner.kind === owner.kind && entry.owner.name === owner.name,
    )?.modules;
    return target.modules.some((moduleId) => {
      const module = modules?.find(({ id }) => id === moduleId);
      return (
        module !== undefined &&
        moduleRequiresCapability(module, owner, "db-sql", catalog)
      );
    });
  });
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
      <div className="p-5 md:p-7">
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
          <FieldDescription className="flex items-start gap-2">
            <Database className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              {databaseRequired
                ? "A selected feature requires a database. Remove that feature before choosing None."
                : "Database-backed modules become available after you select SQLite or Postgres."}
            </span>
          </FieldDescription>
        </Field>
      </div>
    </DisclosurePanel>
  );
}
