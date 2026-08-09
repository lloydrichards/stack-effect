"use client";

import { AlertCircle } from "lucide-react";
import { CommandDock } from "~/components/molecules/command-dock";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { trackEvent } from "~/lib/analytics";
import { PreviewStatus } from "./preview-status";
import { RecipeBuilderProvider } from "./recipe-builder-context";
import { RepositoryExplorer } from "./repository-explorer";
import { StackConfigurator } from "./stack-configurator";
import { TargetSelector } from "./target-selector";
import { useRecipeBuilderState } from "./use-recipe-builder-state";

export function RecipeBuilder() {
  const builder = useRecipeBuilderState();
  const {
    state: { compatibilityNotice, preview, previewError, previewState },
  } = builder;
  const { config, targets } = builder.state;

  const commandReady = preview !== undefined && previewState === "ready";
  const resolvedTargetCount = preview?.blueprint.nodes.filter(
    (node) => node._tag === "target",
  ).length;
  const command = commandReady
    ? preview.command
    : previewState === "starting" || previewState === "loading"
      ? "Generating command…"
      : previewState === "error"
        ? "Command unavailable until the preview recovers"
        : "Complete every target configuration to generate a command";

  return (
    <RecipeBuilderProvider value={builder}>
      <article className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-52 md:pb-32">
        <header className="flex flex-col gap-3 pb-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] md:text-4xl">
              Build your Stack Effect recipe
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground md:text-base">
              Choose targets, attach their modules, and inspect the
              authoritative Blueprint and generated repository before running
              the command.
            </p>
          </div>
          <PreviewStatus
            state={previewState}
            fileCount={preview?.files.length}
            hasPreview={preview !== undefined}
          />
        </header>

        {previewState === "error" ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Preview could not be generated</AlertTitle>
            <AlertDescription>{previewError}</AlertDescription>
          </Alert>
        ) : null}

        {compatibilityNotice ? (
          <Alert>
            <AlertCircle />
            <AlertTitle>Selection adjusted</AlertTitle>
            <AlertDescription>{compatibilityNotice}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2 lg:gap-5 xl:grid-cols-[minmax(22rem,0.8fr)_minmax(0,1.45fr)] xl:gap-6">
          <div className="contents xl:col-start-1 xl:row-start-1 xl:flex xl:min-w-0 xl:flex-col xl:gap-6">
            <div className="min-w-0">
              <StackConfigurator />
            </div>

            <div className="min-w-0">
              <TargetSelector />
            </div>
          </div>

          <div className="min-w-0 lg:col-span-2 xl:col-start-2 xl:row-start-1 xl:self-stretch">
            <div className="xl:sticky xl:top-20">
              <RepositoryExplorer />
            </div>
          </div>
        </div>

        <CommandDock
          summary={
            <>
              {resolvedTargetCount === undefined
                ? "Resolving targets…"
                : `${resolvedTargetCount} resolved ${resolvedTargetCount === 1 ? "target" : "targets"}`}
              {!commandReady ? (
                <Badge variant="secondary" className="ml-2">
                  Not ready
                </Badge>
              ) : null}
            </>
          }
          command={command}
          disabled={!commandReady}
          onCopySuccess={() =>
            trackEvent("recipe-command-copied", {
              selected_target_count: targets.length,
              resolved_target_count: resolvedTargetCount ?? 0,
              selected_module_count: targets.reduce(
                (count, target) => count + target.modules.length,
                0,
              ),
              runtime: config.runtime._tag,
              package_manager:
                config.runtime._tag === "node"
                  ? config.runtime.packageManager
                  : "bun",
              file_count: preview?.files.length ?? 0,
            })
          }
        />
      </article>
    </RecipeBuilderProvider>
  );
}
