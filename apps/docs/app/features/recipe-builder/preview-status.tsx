import { Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { Spinner } from "~/components/ui/spinner";
import type { RecipeBuilderWorkerModel } from "./use-recipe-builder-worker";

type PreviewStatusProps = {
  readonly result: RecipeBuilderWorkerModel["previewResult"];
  readonly canPreview: boolean;
};

export function PreviewStatus({ result, canPreview }: PreviewStatusProps) {
  const hasPreview = Option.isSome(AsyncResult.value(result));
  const message = !canPreview
    ? hasPreview
      ? "Selection incomplete · showing last valid preview"
      : "Complete the Selection to preview"
    : AsyncResult.builder(result)
        .onInitialOrWaiting(() =>
          hasPreview
            ? "Updating · showing last valid preview"
            : "Starting in-memory preview…",
        )
        .onSuccess(
          (preview) =>
            `Live in-memory pipeline · ${preview.files.length} files`,
        )
        .onInterrupt(() => "Starting in-memory preview…")
        .onFailure(() =>
          hasPreview
            ? "Preview unavailable · showing last valid preview"
            : "Preview unavailable",
        )
        .exhaustive();

  return (
    <span
      className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
      aria-live="polite"
    >
      {canPreview && result.waiting ? <Spinner /> : null}
      {message}
    </span>
  );
}
