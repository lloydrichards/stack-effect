import { TargetIdentity } from "@repo/domain/Catalog";
import { useSelector } from "@tanstack/react-form";
import { Option, Schema } from "effect";
import { ArrowRight, Check } from "lucide-react";
import { useRef, useState } from "react";
import { DisclosurePanel } from "~/components/molecules/disclosure-panel";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { CatalogSourcesPanel } from "./catalog-sources";
import { DatabaseSelector } from "./database-selector";
import { ProjectName, usesOfficialCatalog } from "./form";
import { usePresetTargets } from "./preset-targets";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
} from "./recipe-builder-context";
import { RecipeCommand } from "./recipe-command";
import { RepositoryExplorer } from "./repository-explorer";
import { ProjectFields } from "./stack-configurator";
import { TargetWorkspace } from "./target-selector/target-workspace";
import { useTargetEditor } from "./target-selector/use-target-editor";

const ToolSettings = () => {
  const form = useRecipeBuilderFormContext();
  const config = useSelector(form.store, (state) => state.values.config);
  const gitEnabled = useSelector(
    form.store,
    (state) => state.values.gitEnabled,
  );
  const extras = useSelector(
    form.store,
    (state) => state.values.developerExperienceModules,
  );
  const { catalog } = useRecipeBuilderCatalog();
  const summary = [`TS ${config.typescript ?? "6"}`];
  if (usesOfficialCatalog(config.catalogs)) {
    for (const field of ["monorepo", "lint", "format", "test"] as const) {
      const value = config[field];
      if (value)
        summary.push(
          catalog?.configuration[field].find((option) => option.value === value)
            ?.title ?? value,
        );
    }
    if (gitEnabled) summary.push("Git");
    summary.push(
      ...(catalog?.configuration.devenv ?? [])
        .filter((choice) => extras.includes(choice.value))
        .map((choice) => choice.title),
    );
  }
  const tools = [...new Set(summary)];
  const remaining = tools.length - 3;
  return (
    <div className="border-y max-sm:[&_header_button]:gap-0.5 max-sm:[&_header_button]:px-2 [&>section]:rounded-none [&>section]:border-0 [&>section+section]:border-t [&>section]:bg-transparent">
      <DisclosurePanel
        title="Tooling"
        meta={
          <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap font-mono text-xs text-muted-foreground">
            <span className="truncate">{tools.slice(0, 3).join(" · ")}</span>
            {remaining > 0 && (
              <span className="shrink-0">
                +{remaining}
                <span className="sr-only"> more tools</span>
              </span>
            )}
          </span>
        }
      >
        <div className="p-4">
          <ProjectFields section="tools" />
        </div>
      </DisclosurePanel>
      <DatabaseSelector />
      <CatalogSourcesPanel />
    </div>
  );
};

const StackPresets = () => {
  const form = useRecipeBuilderFormContext();
  const { catalog } = useRecipeBuilderCatalog();
  const runtime = useSelector(
    form.store,
    (state) => state.values.config.runtime._tag,
  );
  const selected = useSelector(
    form.store,
    (state) => state.values.developerExperienceModules,
  );
  const included = usePresetTargets();
  const presets = catalog?.configuration.presets ?? [];
  if (presets.length === 0) return null;

  return (
    <fieldset className="space-y-2 border-b pb-4">
      <legend className="font-heading text-xl font-semibold">
        Stack presets
      </legend>
      {presets.map((preset) => {
        const checked = selected.includes(preset.value);
        const compatible = preset.supportedRuntimes.includes(runtime);
        const targets =
          included
            .find((item) => item.preset.value === preset.value)
            ?.targets.filter(({ identity }) => identity.kind === "workspace") ??
          [];
        return (
          <div key={preset.value}>
            <label className="flex items-start gap-3 py-2">
              <input
                aria-label={preset.title}
                className="mt-1 size-4 accent-primary"
                type="checkbox"
                checked={checked}
                disabled={!compatible && !checked}
                onChange={(event) => {
                  const enabled = event.currentTarget.checked;
                  form.setFieldValue("developerExperienceModules", (current) =>
                    enabled
                      ? [...current, preset.value]
                      : current.filter((id) => id !== preset.value),
                  );
                }}
              />
              <span>
                <span className="block text-sm font-medium">
                  {preset.title}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {preset.description}
                  {!compatible && ` Unavailable with ${runtime}.`}
                </span>
              </span>
            </label>
            {targets.length > 0 && (
              <ul
                aria-label={`Targets included by ${preset.title}`}
                className="ml-7 space-y-2 border-l pl-3 text-sm"
              >
                {targets.map((target) => (
                  <li key={target.id}>
                    <span className="font-mono font-medium">
                      {target.identity.kind === "workspace"
                        ? "Workspace"
                        : `${target.identity.kind}/${target.identity.name}`}
                    </span>
                    <ul className="text-muted-foreground">
                      {target.modules.map((module) => (
                        <li key={module.id}>{module.title}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </fieldset>
  );
};

const steps = [
  ["project", "Project setup"],
  ["targets", "Targets & files"],
] as const;
type Step = (typeof steps)[number][0];

export const BuilderWorkspace = () => {
  const form = useRecipeBuilderFormContext();
  const config = useSelector(form.store, (state) => state.values.config);
  const [step, setStep] = useState<Step>(() =>
    form.store.state.values.targets.length ? "targets" : "project",
  );
  const editor = useTargetEditor();
  const heading = useRef<HTMLHeadingElement>(null);
  const working = step === "targets";
  const canContinue = Schema.is(ProjectName)(config.name);
  const go = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  };
  const folder =
    working && editor.activeTarget
      ? Option.map(
          Schema.decodeUnknownOption(TargetIdentity)(editor.activeTarget),
          (identity) => identity.toPath(),
        ).pipe(Option.getOrUndefined)
      : undefined;
  return (
    <div className="space-y-5">
      <nav
        aria-label="Builder steps"
        className="flex flex-wrap gap-x-5 border-b"
      >
        {steps.map(([value, label], index) => (
          <button
            key={value}
            type="button"
            aria-current={step === value ? "step" : undefined}
            disabled={value !== "project" && !canContinue}
            onClick={() => go(value)}
            className="flex min-h-11 items-center gap-2 border-b-2 border-transparent text-sm text-muted-foreground aria-[current=step]:border-primary aria-[current=step]:font-medium aria-[current=step]:text-foreground disabled:opacity-50"
          >
            <span className="font-mono text-xs">{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(20rem,0.9fr)_minmax(0,1.3fr)]">
        <section className="min-w-0">
          <h2
            ref={heading}
            tabIndex={-1}
            className={cn(
              "mb-5 scroll-mt-20 font-heading text-xl font-semibold tracking-tight focus:outline-none",
              working && "sr-only",
            )}
          >
            {working ? "Targets and files" : "Set up your project"}
          </h2>
          {!working && (
            <div className="space-y-5">
              <ProjectFields section="project" />
              <ToolSettings />
              <Button
                className="h-12 w-full justify-between px-4 text-sm lg:h-12"
                disabled={!canContinue}
                onClick={() => go("targets")}
              >
                Next: Explore targets <ArrowRight />
              </Button>
            </div>
          )}
          <div hidden={!working} className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b pb-2 text-xs">
              <span className="inline-flex min-w-0 items-center gap-2 truncate font-mono text-muted-foreground">
                <Check className="size-4 shrink-0 text-primary" />
                {config.name} · {config.runtime._tag}
              </span>
              <a
                href="#repository-files"
                className="ml-auto inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline lg:hidden"
              >
                View files
              </a>
              <Button size="sm" variant="ghost" onClick={() => go("project")}>
                Edit setup
              </Button>
            </div>
            <StackPresets />
            <TargetWorkspace editor={editor} />
          </div>
        </section>

        <div
          id="repository-files"
          tabIndex={-1}
          className="min-w-0 scroll-mt-20 lg:sticky lg:top-20"
        >
          <RepositoryExplorer activeFolder={folder} />
        </div>
      </div>
      {working && <RecipeCommand />}
    </div>
  );
};
