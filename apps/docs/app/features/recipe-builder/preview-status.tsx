import { Spinner } from "~/components/ui/spinner";
import type { PreviewState } from "./use-recipe-builder-state";

type PreviewStatusProps = {
  readonly state: PreviewState;
  readonly fileCount: number | undefined;
  readonly hasPreview: boolean;
};

export function PreviewStatus({
  state,
  fileCount,
  hasPreview,
}: PreviewStatusProps) {
  const messages: Record<PreviewState, string> = {
    starting: "Starting in-memory preview…",
    loading: hasPreview
      ? "Updating · showing last valid preview"
      : "Starting in-memory preview…",
    ready: `Live in-memory pipeline · ${fileCount ?? 0} files`,
    invalid: hasPreview
      ? "Selection incomplete · showing last valid preview"
      : "Complete the Selection to preview",
    error: hasPreview
      ? "Preview unavailable · showing last valid preview"
      : "Preview unavailable",
  };

  return (
    <span
      className="flex items-center gap-2 font-mono text-xs text-muted-foreground"
      aria-live="polite"
    >
      {state === "starting" || state === "loading" ? <Spinner /> : null}
      {messages[state]}
    </span>
  );
}
