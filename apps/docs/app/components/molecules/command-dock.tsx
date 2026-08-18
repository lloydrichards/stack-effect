"use client";

import { Check, Clipboard, Share2 } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

type CommandDockProps = {
  readonly command: string;
  readonly summary: ReactNode;
  readonly disabled?: boolean;
  readonly shareUrl?: string;
  readonly sticky?: boolean;
  readonly onCopySuccess?: () => void;
  readonly onShareSuccess?: () => void;
};

export function CommandDock({
  command,
  summary,
  disabled = false,
  shareUrl,
  sticky = true,
  onCopySuccess,
  onShareSuccess,
}: CommandDockProps) {
  const { status, copy, reset } = useCopyToClipboard();
  const {
    status: shareStatus,
    copy: copyShareUrl,
    reset: resetShareStatus,
  } = useCopyToClipboard();
  const titleId = useId();

  useEffect(() => {
    reset();
    resetShareStatus();
  }, [command, reset, resetShareStatus, shareUrl]);

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
  const shareRecipe = async () => {
    if (
      shareUrl &&
      (await copyShareUrl(new URL(shareUrl, window.location.origin).toString()))
    ) {
      onShareSuccess?.();
    }
  };
  const activeStatus = shareStatus === "idle" ? status : shareStatus;
  const activeStatusMessage =
    shareStatus === "copied"
      ? "Recipe link copied — share it with your team."
      : shareStatus === "error"
        ? "Could not access the clipboard. Copy the URL from your browser instead."
        : statusMessage;

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
              activeStatus === "copied" && "text-muted-foreground",
              activeStatus === "error" && "text-destructive",
              activeStatus === "idle" && "invisible",
            )}
            aria-hidden="true"
          >
            {activeStatusMessage}
          </p>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {activeStatusMessage}
          </p>
        </div>
        <div className="flex gap-2">
          {shareUrl ? (
            <Button
              variant="outline"
              className="h-11 w-11 p-0 text-center sm:w-auto sm:px-4 sm:has-data-[icon=inline-start]:pl-4 lg:h-11"
              type="button"
              onClick={shareRecipe}
              disabled={disabled}
            >
              {shareStatus === "copied" ? (
                <Check data-icon="inline-start" />
              ) : (
                <Share2 data-icon="inline-start" />
              )}
              <span className="hidden sm:inline">
                {shareStatus === "copied" ? "Copied" : "Share"}
              </span>
              <span className="sr-only sm:hidden">Share recipe</span>
            </Button>
          ) : null}
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
      </div>
    </aside>
  );
}
