"use client";

import { Check } from "lucide-react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Button } from "~/components/ui/button";
import {
  Field,
  FieldContent,
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
import type { BuilderCatalogOutputWire } from "../../worker/recipe-preview-protocol";
import type {
  CatalogState,
  StackConfiguration,
} from "./use-recipe-builder-state";

type StackConfiguratorProps = {
  readonly config: StackConfiguration;
  readonly choices: BuilderCatalogOutputWire["configuration"] | undefined;
  readonly choicesState: CatalogState;
  readonly gitEnabled: boolean;
  readonly developerExperienceModules: ReadonlyArray<string>;
  readonly configure: (updates: Partial<StackConfiguration>) => void;
  readonly retryChoices: () => void;
  readonly setGitEnabled: (enabled: boolean) => void;
  readonly toggleDeveloperExperienceModule: (moduleId: string) => void;
};

type ToolField = "monorepo" | "lint" | "format" | "test";

export function StackConfigurator({
  config,
  choices,
  choicesState,
  gitEnabled,
  developerExperienceModules,
  configure,
  retryChoices,
  setGitEnabled,
  toggleDeveloperExperienceModule,
}: StackConfiguratorProps) {
  const runtime = config.runtime._tag;
  const packageManager =
    config.runtime._tag === "node" ? config.runtime.packageManager : "bun";
  const nameInvalid = config.name.trim().length === 0;
  const updateTool = (field: ToolField, value: string) =>
    configure({ [field]: value.length > 0 ? value : undefined });

  return (
    <DisclosurePanel
      title="Project setup"
      description="Configure the project foundation and repository tooling."
      defaultOpen
      actions={
        choicesState === "loading" ? (
          <span
            className="flex items-center gap-2 px-2 text-xs text-muted-foreground"
            role="status"
          >
            <Spinner />
            <span className="hidden sm:inline">Loading options…</span>
          </span>
        ) : choicesState === "error" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-11 lg:h-7"
            onClick={retryChoices}
          >
            Retry options
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 md:p-5">
        <FieldGroup className="sm:col-span-2">
          <Field data-invalid={nameInvalid || undefined}>
            <FieldLabel htmlFor="stack-project-name">Project name</FieldLabel>
            <FieldContent>
              <Input
                id="stack-project-name"
                value={config.name}
                required
                spellCheck={false}
                className="h-11 lg:h-8"
                aria-invalid={nameInvalid}
                onChange={(event) => configure({ name: event.target.value })}
                onBlur={() => configure({ name: config.name.trim() })}
              />
              {nameInvalid ? (
                <FieldError>Enter a project name.</FieldError>
              ) : null}
            </FieldContent>
          </Field>
        </FieldGroup>

        <Field className="sm:col-span-2">
          <FieldLabel id="stack-runtime-label">Runtime</FieldLabel>
          <ToggleGroup
            aria-labelledby="stack-runtime-label"
            value={[runtime]}
            variant="outline"
            className="grid h-11 w-full grid-cols-2 lg:h-8"
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
            <ToggleGroupItem value="bun" className="h-full w-full">
              Bun
            </ToggleGroupItem>
            <ToggleGroupItem value="node" className="h-full w-full">
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
            configure({
              runtime: {
                _tag: "node",
                packageManager: value === "npm" ? "npm" : "pnpm",
              },
            })
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
            configure({ typescript: value === "7" ? "7" : "6" })
          }
        />

        {(["monorepo", "lint", "format", "test"] as const).map((field) => (
          <ConfigurationSelect
            key={field}
            id={`stack-${field}`}
            label={field === "monorepo" ? "Monorepo" : capitalize(field)}
            value={config[field] ?? ""}
            options={
              choices?.[field].map((choice) => ({
                value: choice.value,
                label: choice.title,
              })) ?? []
            }
            optional
            disabled={choices === undefined}
            onChange={(value) => updateTool(field, value)}
          />
        ))}

        <FieldSet className="gap-2 sm:col-span-2">
          <FieldLegend variant="label">Repository and DX</FieldLegend>
          <div className="grid grid-cols-1 overflow-hidden rounded-md border sm:grid-cols-3">
            <ConfigurationToggle
              id="stack-git"
              title="Git"
              description="Initialize a Git repository with an initial commit."
              checked={gitEnabled}
              onCheckedChange={setGitEnabled}
            />
            {choices?.developerExperience.map((choice) => (
              <ConfigurationToggle
                key={choice.id}
                id={`stack-${choice.id}`}
                title={choice.title}
                description={choice.description}
                checked={developerExperienceModules.includes(choice.id)}
                onCheckedChange={() =>
                  toggleDeveloperExperienceModule(choice.id)
                }
              />
            ))}
          </div>
        </FieldSet>
      </div>
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
  readonly optional?: boolean;
  readonly disabled?: boolean;
  readonly onChange: (value: string) => void;
};

function ConfigurationSelect({
  id,
  label,
  value,
  options,
  optional = false,
  disabled = false,
  onChange,
}: ConfigurationSelectProps) {
  const unavailable =
    !disabled &&
    value.length > 0 &&
    !options.some((option) => option.value === value);
  return (
    <Field
      data-disabled={disabled || undefined}
      data-invalid={unavailable || undefined}
    >
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={value || "__none__"}
        disabled={disabled}
        onValueChange={(nextValue) =>
          onChange(nextValue === "__none__" ? "" : (nextValue ?? ""))
        }
      >
        <SelectTrigger
          id={id}
          className="w-full text-sm data-[size=default]:h-11 lg:text-xs lg:data-[size=default]:h-8"
          aria-invalid={unavailable}
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
            {optional ? <SelectItem value="__none__">None</SelectItem> : null}
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {unavailable ? (
        <FieldError>
          {value} is unavailable. Choose another option or None.
        </FieldError>
      ) : null}
    </Field>
  );
}

type ConfigurationToggleProps = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
};

function ConfigurationToggle({
  id,
  title,
  description,
  checked,
  onCheckedChange,
}: ConfigurationToggleProps) {
  return (
    <Toggle
      id={id}
      variant="outline"
      pressed={checked}
      onPressedChange={onCheckedChange}
      className="h-auto min-h-11 min-w-0 justify-center rounded-none border-0 border-b px-2 py-2 text-center whitespace-normal last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
    >
      {checked ? (
        <Check
          data-icon="inline-start"
          className="size-3.5 text-primary"
          aria-hidden="true"
        />
      ) : null}
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="sr-only">{description}</span>
    </Toggle>
  );
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
