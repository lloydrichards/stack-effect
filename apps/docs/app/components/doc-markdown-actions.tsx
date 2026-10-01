import { Effect } from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";
import { Check, Copy, FileText } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";

export function DocMarkdownActions({ href }: { readonly href: string }) {
  const { status, copy } = useCopyToClipboard();
  const [requestStatus, setRequestStatus] = useState<
    "idle" | "loading" | "error"
  >("idle");
  const copyMarkdown = () => {
    setRequestStatus("loading");
    void Effect.runPromise(
      Effect.gen(function* () {
        const response = yield* HttpClient.get(
          new URL(href, window.location.href).href,
        );
        if (
          response.status < 200 ||
          response.status >= 300 ||
          !response.headers["content-type"]?.startsWith("text/markdown")
        )
          return false;
        const text = yield* response.text;
        return yield* Effect.tryPromise({
          try: () => copy(text),
          catch: () => "Clipboard access failed",
        });
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.orElseSucceed(() => false),
      ),
    ).then((copied) => setRequestStatus(copied ? "idle" : "error"));
  };
  const message =
    requestStatus === "error" || status === "error"
      ? "Could not copy Markdown. Try again or use View Markdown."
      : status === "copied"
        ? "Page Markdown copied to the clipboard."
        : "";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={copyMarkdown}
        disabled={requestStatus === "loading"}
      >
        {status === "copied" ? <Check /> : <Copy />}
        {requestStatus === "loading"
          ? "Loading Markdown…"
          : requestStatus === "error" || status === "error"
            ? "Try copying again"
            : status === "copied"
              ? "Copied"
              : "Copy Markdown"}
      </Button>
      <a
        href={href}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <FileText />
        View Markdown
      </a>
      <span
        className={
          requestStatus === "error" || status === "error"
            ? "w-full text-xs text-destructive"
            : "sr-only"
        }
        role="status"
        aria-live="polite"
      >
        {message}
      </span>
    </div>
  );
}
