"use client";

import { useSelector } from "@tanstack/react-form";
import { String as Str } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Check } from "lucide-react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Button } from "~/components/ui/button";
import {
  Field,
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
import { Spinner } from "~/components/ui/spinner";
import { Toggle } from "~/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
} from "./recipe-builder-context";

type ToolField = "monorepo" | "lint" | "format" | "test";

const huskyModuleId = "workspace-devenv-husky";

export function StackConfigurator() {
  const form = useRecipeBuilderFormContext();
  const {
    catalog,
    catalogResult,
    retryCatalog: retryChoices,
  } = useRecipeBuilderCatalog();
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
  const runtime = config.runtime._tag;
  const packageManager =
    config.runtime._tag === "node" ? config.runtime.packageManager : "bun";
  const configure = (updates: Partial<typeof config>) =>
    form.setFieldValue("config", (current) => ({ ...current, ...updates }));
  const updateTool = (field: ToolField, value: string) =>
    configure({
      [field]: value || undefined,
    });

  return (
    <DisclosurePanel
      title="Project setup"
      description="Configure the project foundation and repository tooling."
      defaultOpen
      actions={AsyncResult.builder(catalogResult)
        .onSuccess(() => null)
        .onInitialOrWaiting(() =>
          catalog === undefined ? (
            <span
              className="flex items-center gap-2 px-2 text-xs text-muted-foreground"
              role="status"
            >
              <Spinner />
              <span className="sr-only sm:not-sr-only">Loading options…</span>
            </span>
          ) : null,
        )
        .onFailure(() => (
          <Button variant="ghost" size="sm" onClick={retryChoices}>
            Retry options
          </Button>
        ))
        .orNull()}
    >
      <FieldGroup className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-5">
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
            className="grid w-full grid-cols-2"
            onValueChange={(values) => {
              const value = values[0] ?? runtime;
              configure({
                runtime:
                  value === "bun"
                    ? { _tag: "bun" }
                    : {
                        _tag: "node",
                        packageManager:
                          packageManager === "bun" ? "pnpm" : packageManager,
                      },
              });
            }}
          >
            <ToggleGroupItem value="bun" className="w-full">
              Bun
            </ToggleGroupItem>
            <ToggleGroupItem value="node" className="w-full">
              Node
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <ConfigurationSelect
          id="stack-package-manager"
          label="Package manager"
          value={packageManager}
          options={
            runtime === "bun"
              ? [{ value: "bun", label: "Bun" }]
              : [
                  { value: "pnpm", label: "pnpm" },
                  { value: "npm", label: "npm" },
                ]
          }
          disabled={runtime === "bun"}
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

        <ConfigurationSelect
          id="stack-typescript"
          label="TypeScript"
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

        {(["monorepo", "lint", "format", "test"] as const).map((field) => (
          <ConfigurationSelect
            key={field}
            id={`stack-${field}`}
            label={field === "monorepo" ? "Monorepo" : Str.capitalize(field)}
            value={config[field] ?? ""}
            options={
              choices?.[field].map((choice) => ({
                value: choice.value,
                label: choice.title,
              })) ?? []
            }
            disabled={choices === undefined}
            onChange={(value) => updateTool(field, value)}
          />
        ))}

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
                  form.setFieldValue("developerExperienceModules", (current) =>
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
                checked={developerExperienceModules.includes(choice.value)}
                disabled={!gitEnabled && choice.value === huskyModuleId}
                onCheckedChange={() =>
                  form.setFieldValue("developerExperienceModules", (current) =>
                    current.includes(choice.value)
                      ? current.filter((id) => id !== choice.value)
                      : [...current, choice.value],
                  )
                }
              />
            ))}
          </FieldGroup>
        </FieldSet>
      </FieldGroup>
    </DisclosurePanel>
  );
}

type ConfigurationSelectProps = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: ReadonlyArray<{
    readonly value: string;
    readonly label: string;
  }>;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
};

function ConfigurationSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: ConfigurationSelectProps) {
  const unavailable =
    !disabled &&
    value.length > 0 &&
    !options.some((option) => option.value === value);
  return (
    <Field data-disabled={disabled} data-invalid={unavailable}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || "__none__"}
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue === "__none__" ? "" : (nextValue ?? ""))
        }
      >
        <SelectTrigger id={id} className="w-full" aria-invalid={unavailable}>
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
              <SelectItem key={option.value} value={option.value}>
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
}

type ConfigurationToggleProps = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

function ConfigurationToggle({
  id,
  title,
  description,
  checked,
  disabled = false,
  onCheckedChange,
}: ConfigurationToggleProps) {
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
}
