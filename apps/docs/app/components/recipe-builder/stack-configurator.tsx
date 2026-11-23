"use client";

import { makeRuntime } from "@repo/domain/Scaffold";
import { defaultsForRuntime } from "@repo/scaffold/browser";
import { useSelector } from "@tanstack/react-form";
import { String as Str } from "effect";
import { Check } from "lucide-react";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Toggle } from "~/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { initialRecipeBuilderValues, usesOfficialCatalog } from "./form";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
} from "./recipe-builder-context";

type ToolField = "monorepo" | "lint" | "format" | "test";

const toolDescriptions: Record<ToolField, string> = {
  monorepo: "Runs tasks across apps and packages.",
  lint: "Checks code for common mistakes.",
  format: "Keeps code formatting consistent.",
  test: "Runs the project’s test suite.",
};

const huskyModuleId = "workspace-devenv-husky";

export const ProjectFields = ({
  section,
}: {
  section: "project" | "tools";
}) => {
  const form = useRecipeBuilderFormContext();
  const { catalog } = useRecipeBuilderCatalog();
  const config = useSelector(form.store, (state) => state.values.config);
  const developerExperienceModules = useSelector(
    form.store,
    (state) => state.values.developerExperienceModules,
  );
  const gitEnabled = useSelector(
    form.store,
    (state) => state.values.gitEnabled,
  );
  const choices = catalog?.configuration;
  // Tool and repository choices name official modules.
  const official = usesOfficialCatalog(config.catalogs);
  const runtime = config.runtime._tag;
  const packageManager =
    config.runtime._tag === "node"
      ? config.runtime.packageManager
      : config.runtime._tag;
  const configure = (updates: Partial<typeof config>) =>
    form.setFieldValue("config", (current) => ({ ...current, ...updates }));
  const updateTool = (field: ToolField, value: string) =>
    configure({
      [field]: value || undefined,
    });

  return (
    <FieldGroup className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {section !== "tools" && (
        <>
          <form.Field
            name="config.name"
            children={(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field className="sm:col-span-2" data-invalid={isInvalid}>
                  <FieldLabel htmlFor="stack-project-name">
                    Project name
                  </FieldLabel>
                  <Input
                    id="stack-project-name"
                    name={field.name}
                    value={field.state.value}
                    required
                    spellCheck={false}
                    aria-invalid={isInvalid}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={() => {
                      field.handleChange(field.state.value.trim());
                      field.handleBlur();
                    }}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />

          <Field className="sm:col-span-2">
            <FieldLabel id="stack-runtime-label">Runtime</FieldLabel>
            <ToggleGroup
              aria-labelledby="stack-runtime-label"
              value={[runtime]}
              variant="outline"
              className="grid w-full grid-cols-3"
              onValueChange={(values) => {
                const value = values[0] ?? runtime;
                const nextRuntime =
                  value === "bun" || value === "deno" ? value : "node";
                configure({
                  runtime: makeRuntime(nextRuntime, packageManager),
                  ...(nextRuntime === "deno"
                    ? defaultsForRuntime(
                        initialRecipeBuilderValues.config,
                        "deno",
                      )
                    : {}),
                });
              }}
            >
              <ToggleGroupItem value="bun" className="w-full">
                Bun
              </ToggleGroupItem>
              <ToggleGroupItem value="node" className="w-full">
                Node
              </ToggleGroupItem>
              <ToggleGroupItem value="deno" className="w-full">
                Deno
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {runtime === "node" && (
            <ConfigurationSelect
              id="stack-package-manager"
              label="Package manager"
              value={packageManager}
              options={
                runtime !== "node"
                  ? [
                      {
                        value: runtime,
                        label: runtime === "deno" ? "Deno" : "Bun",
                      },
                    ]
                  : [
                      { value: "pnpm", label: "pnpm" },
                      { value: "npm", label: "npm" },
                    ]
              }
              disabled={runtime !== "node"}
              onChange={(value) =>
                form.setFieldValue("config", (current) =>
                  current.runtime._tag === "node" &&
                  (value === "pnpm" || value === "npm")
                    ? {
                        ...current,
                        runtime: {
                          ...current.runtime,
                          packageManager: value,
                        },
                      }
                    : current,
                )
              }
            />
          )}
        </>
      )}
      {section !== "project" && (
        <>
          <ConfigurationSelect
            id="stack-typescript"
            label="TypeScript"
            description="Selects the TypeScript version used for type checking."
            value={config.typescript ?? "6"}
            options={[
              { value: "6", label: "TypeScript 6" },
              { value: "7", label: "TypeScript 7" },
            ]}
            onChange={(value) =>
              configure({
                typescript: value === "7" ? "7" : "6",
              })
            }
          />

          {official ? (
            <>
              {(["monorepo", "lint", "format", "test"] as const).map(
                (field) => (
                  <ConfigurationSelect
                    key={field}
                    id={`stack-${field}`}
                    description={toolDescriptions[field]}
                    label={
                      field === "monorepo" ? "Monorepo" : Str.capitalize(field)
                    }
                    value={config[field] ?? ""}
                    options={
                      choices?.[field].map((choice) => ({
                        value: choice.value,
                        label: choice.supportedRuntimes.includes(runtime)
                          ? choice.title
                          : `${choice.title} (unavailable with ${runtime})`,
                        disabled: !choice.supportedRuntimes.includes(runtime),
                      })) ?? []
                    }
                    disabled={choices === undefined}
                    onChange={(value) => updateTool(field, value)}
                  />
                ),
              )}

              <FieldSet className="sm:col-span-2">
                <FieldLegend variant="label" className="mb-2">
                  Repository and DX
                </FieldLegend>
                <FieldGroup
                  variant="outlined"
                  className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2"
                >
                  <ConfigurationToggle
                    id="stack-git"
                    title="Git"
                    description="Initialize a Git repository with an initial commit."
                    checked={gitEnabled}
                    onCheckedChange={(enabled) => {
                      form.setFieldValue("gitEnabled", enabled);
                      if (!enabled) {
                        form.setFieldValue(
                          "developerExperienceModules",
                          (current) =>
                            current.filter((id) => id !== huskyModuleId),
                        );
                      }
                    }}
                  />
                  {choices?.devenv.map((choice) => (
                    <ConfigurationToggle
                      key={choice.value}
                      id={`stack-${choice.value}`}
                      title={choice.title}
                      description={choice.description}
                      checked={developerExperienceModules.includes(
                        choice.value,
                      )}
                      disabled={!gitEnabled && choice.value === huskyModuleId}
                      onCheckedChange={() =>
                        form.setFieldValue(
                          "developerExperienceModules",
                          (current) =>
                            current.includes(choice.value)
                              ? current.filter((id) => id !== choice.value)
                              : [...current, choice.value],
                        )
                      }
                    />
                  ))}
                </FieldGroup>
              </FieldSet>
            </>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Tool and repository options come from the official catalog. Add it
              under Catalogs to choose them.
            </p>
          )}
        </>
      )}
    </FieldGroup>
  );
};

type ConfigurationSelectProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly description?: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
  }>;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
};

const ConfigurationSelect = ({
  id,
  label,
  description,
  value,
  options,
  disabled = false,
  onChange,
}: ConfigurationSelectProps) => {
  const selectedOption = options.find((option) => option.value === value);
  const unavailable =
    !disabled &&
    value.length > 0 &&
    (selectedOption === undefined || selectedOption.disabled === true);
  return (
    <Field
      data-disabled={disabled}
      data-invalid={unavailable}
      className={
        description
          ? "sm:col-span-2 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(8rem,38%)] sm:items-center sm:gap-x-4"
          : undefined
      }
    >
      <div className="space-y-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {description && (
          <FieldDescription id={id + "-description"}>
            {description}
          </FieldDescription>
        )}
      </div>
      <Select
        value={value || "__none__"}
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue === "__none__" ? "" : (nextValue ?? ""))
        }
      >
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={unavailable}
          aria-describedby={description ? id + "-description" : undefined}
        >
          <SelectValue>
            {value.length === 0
              ? "None"
              : (options.find((option) => option.value === value)?.label ??
                value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {unavailable && (
        <FieldError>{value} is unavailable. Choose another option.</FieldError>
      )}
    </Field>
  );
};

type ConfigurationToggleProps = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

const ConfigurationToggle = ({
  id,
  title,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: ConfigurationToggleProps) => {
  return (
    <Toggle
      id={id}
      variant="outline"
      pressed={checked}
      disabled={disabled}
      onPressedChange={onCheckedChange}
      className="h-auto min-h-11 min-w-0 justify-center rounded-none border-0 bg-background px-2 py-2 text-center whitespace-normal"
    >
      {checked ? <Check data-icon="inline-start" aria-hidden="true" /> : null}
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="sr-only">{description}</span>
    </Toggle>
  );
};
