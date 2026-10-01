import { Check, Copy } from "lucide-react";
import { Button } from "~/components/ui/button";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";
import { agentBootstrapPrompt } from "~/lib/docs-manifest";

export function AgentBootstrap() {
  const { status, copy } = useCopyToClipboard();
  return (
    <section
      aria-labelledby="agent-bootstrap-heading"
      className="my-8 rounded-md border border-border bg-muted/30 p-4 sm:p-5"
    >
      <h2
        id="agent-bootstrap-heading"
        className="m-0 font-heading text-lg font-semibold"
      >
        Give your coding agent a starting point
      </h2>
      <p className="mt-3 text-sm leading-relaxed">
        Copy this prompt into your agent's chat with a description of what you
        want to build or change. The workflow below supplies the detailed
        commands.
      </p>
      <blockquote className="my-4 text-sm leading-relaxed text-muted-foreground">
        {agentBootstrapPrompt}
      </blockquote>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => copy(agentBootstrapPrompt)}
      >
        {status === "copied" ? <Check /> : <Copy />}
        {status === "copied"
          ? "Copied"
          : status === "error"
            ? "Try copying again"
            : "Copy agent prompt"}
      </Button>
      <span
        className={
          status === "error" ? "mt-2 block text-xs text-destructive" : "sr-only"
        }
        role="status"
        aria-live="polite"
      >
        {status === "copied"
          ? "Agent prompt copied to the clipboard."
          : status === "error"
            ? "Could not copy the prompt. Select and copy the text above."
            : ""}
      </span>
    </section>
  );
}
