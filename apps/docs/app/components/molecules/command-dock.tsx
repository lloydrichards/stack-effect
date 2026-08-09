"use client";

import { Check, Clipboard } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

type CommandDockProps = {
  readonly command: string;
  readonly summary: ReactNode;
  readonly disabled?: boolean;
  readonly sticky?: boolean;
  readonly onCopySuccess?: () => void;
};

export function CommandDock({
  command,
  summary,
  disabled = false,
  sticky = true,
  onCopySuccess,
}: CommandDockProps) {
  const { status, copy, reset } = useCopyToClipboard();
  const titleId = useId();

  useEffect(() => {
    reset();
  }, [command, reset]);

  const copyLabel =
    status === "copied"
      ? "Copied"
      : status === "error"
        ? "Try copying again"
        : "Copy command";
  const statusMessage =
    status === "copied"
      ? "Copied — paste into your terminal."
      : status === "error"
        ? "Could not access the clipboard. Select the command and copy it manually."
        : "";
  const copyCommand = async () => {
    if (await copy(command)) onCopySuccess?.();
  };

  return (
    <aside
      className={cn(
        "grid gap-0 rounded-md border bg-background/95 p-2 shadow-sm backdrop-blur-sm sm:gap-3 sm:p-4 dark:shadow-none",
        sticky &&
          "fixed right-5 bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-5 z-20 mx-auto max-w-[96rem] sm:right-8 sm:bottom-4 sm:left-8 lg:right-12 lg:left-12",
      )}
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className="sr-only">
        Run this recipe locally
      </h2>
      <div className="hidden min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:flex">
        <span
          className="font-heading text-sm font-semibold tracking-[-0.01em]"
          aria-hidden="true"
        >
          Run this recipe locally
        </span>
        <div className="text-xs text-muted-foreground">{summary}</div>
      </div>
      <div className="sr-only sm:hidden">{summary}</div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:gap-3">
        <div className="min-w-0">
          <code
            className={cn(
              "flex h-11 min-w-0 items-center overscroll-x-contain overflow-x-auto whitespace-nowrap rounded-sm border border-code-border px-3 font-terminal text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              disabled
                ? "bg-muted text-muted-foreground"
                : "bg-code text-code-foreground",
            )}
            tabIndex={0}
            aria-label="Command to run locally"
            aria-disabled={disabled}
          >
            {command}
          </code>
          <p
            className={cn(
              "mt-1.5 hidden min-h-4 text-xs sm:block",
              status === "copied" && "text-muted-foreground",
              status === "error" && "text-destructive",
              status === "idle" && "invisible",
            )}
            aria-hidden="true"
          >
            {statusMessage}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {statusMessage}
          </p>
        </div>
        <Button
          className="h-11 w-11 p-0 text-center has-data-[icon=inline-start]:pl-0 sm:w-auto sm:px-4 sm:has-data-[icon=inline-start]:pl-4 lg:h-11"
          type="button"
          onClick={copyCommand}
          disabled={disabled}
        >
          {status === "copied" ? (
            <Check data-icon="inline-start" />
          ) : (
            <Clipboard data-icon="inline-start" />
          )}
          <span className="hidden sm:inline">{copyLabel}</span>
          <span className="sr-only sm:hidden">{copyLabel}</span>
        </Button>
      </div>
    </aside>
  );
}
