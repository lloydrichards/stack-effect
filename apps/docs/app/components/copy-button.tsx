"use client";

import { useCallback } from "react";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";
import { cn } from "~/lib/utils";

interface CopyButtonProps {
  getValue: () => string;
  className?: string;
}

export function CopyButton({ getValue, className }: CopyButtonProps) {
  const { status, copy } = useCopyToClipboard();

  const handleCopy = useCallback(async () => {
    await copy(getValue());
  }, [copy, getValue]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "absolute top-1.5 right-1.5 flex size-11 items-center justify-center rounded-sm bg-code-block text-code-block-foreground/50 transition-colors duration-150 hover:bg-accent hover:text-code-block-foreground sm:top-3 sm:right-3 sm:size-8 sm:bg-transparent",
        className,
      )}
      aria-label={
        status === "copied"
          ? "Code copied"
          : status === "error"
            ? "Copy failed; select the code manually"
            : "Copy code"
      }
    >
      {status === "copied" ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      {status === "error" ? (
        <span
          role="status"
          className="absolute top-full right-0 mt-1 w-max max-w-40 rounded-sm bg-destructive px-2 py-1 text-right text-xs leading-tight text-destructive-foreground shadow-sm"
        >
          Couldn’t copy. Select manually.
        </span>
      ) : null}
    </button>
  );
}
