import { Option } from "effect";
import { AsyncResult } from "effect/reactivity";
import { useLocation } from "react-router";
import { CommandDock } from "~/components/molecules/command-dock";
import { Badge } from "~/components/ui/badge";
import { trackEvent } from "~/lib/analytics";
import {
  useRecipeBuilderCatalog,
  useRecipeBuilderFormContext,
  useRecipeBuilderPreview,
} from "./recipe-builder-context";

export const RecipeCommand = () => {
  const form = useRecipeBuilderFormContext();
  const { catalog } = useRecipeBuilderCatalog();
  const { canPreview, previewResult } = useRecipeBuilderPreview();
  const cachedSources =
    catalog?.sources.filter((source) => source.freshness === "cached") ?? [];
  const location = useLocation();
  const preview = Option.getOrUndefined(AsyncResult.value(previewResult));

  const commandReady =
    canPreview &&
    AsyncResult.isSuccess(previewResult) &&
    !previewResult.waiting;
  const resolvedTargetCount = preview?.blueprint.nodes.filter(
    (node) => node._tag === "target",
  ).length;
  const command = !canPreview
    ? "Complete every target configuration to generate a command"
    : AsyncResult.builder(previewResult)
        .onInitialOrWaiting(() => "Generating command…")
        .onSuccess((current) => current.command)
        .onInterrupt(() => "Generating command…")
        .onFailure(() => "Command unavailable until the preview recovers")
        .exhaustive();
  const recipeEventData = () => {
    const { config, targets } = form.store.state.values;
    return {
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
          : config.runtime._tag,
      file_count: preview?.files.length ?? 0,
    };
  };
  const trackCommandCopy = () =>
    trackEvent("recipe-command-copied", recipeEventData());
  const trackRecipeShare = () => trackEvent("recipe-shared", recipeEventData());

  return (
    <CommandDock
      summary={
        <>
          {commandReady && resolvedTargetCount !== undefined
            ? `${resolvedTargetCount} resolved ${resolvedTargetCount === 1 ? "target" : "targets"}`
            : null}
          {cachedSources.length > 0 ? (
            <Badge variant="destructive" className="ml-2">
              Cached: {cachedSources.map((source) => source.name).join(", ")}
            </Badge>
          ) : null}
        </>
      }
      command={command}
      disabled={!commandReady}
      shareUrl={`${location.pathname}${location.search}`}
      onCopySuccess={trackCommandCopy}
      onShareSuccess={trackRecipeShare}
    />
  );
};
