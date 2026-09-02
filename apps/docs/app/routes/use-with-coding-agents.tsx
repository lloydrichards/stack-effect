import guideMarkdown from "virtual:coding-agent-guide-markdown";
import { Check, Copy } from "lucide-react";
import type { LinksFunction } from "react-router";
import { typefaceHeading1 } from "~/components/tokens/typeface";
import { Button } from "~/components/ui/button";
import Guide, * as guideModule from "~/content/use-with-coding-agents.mdx";
import { useCopyToClipboard } from "~/hooks/use-copy-to-clipboard";

export const handle = "handle" in guideModule ? guideModule.handle : undefined;

export const links: LinksFunction = () => [
  {
    rel: "alternate",
    type: "text/markdown",
    href: "/use-with-coding-agents.md",
  },
];

export default function UseWithCodingAgentsRoute() {
  const { status, copy } = useCopyToClipboard();

  return (
    <>
      <h1 className={typefaceHeading1("mt-2 scroll-m-20")}>
        Use Stack Effect with coding agents
      </h1>
      <div className="mt-4 flex">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => copy(guideMarkdown)}
        >
          {status === "copied" ? <Check /> : <Copy />}
          {status === "copied"
            ? "Copied"
            : status === "error"
              ? "Try copying again"
              : "Copy Markdown"}
        </Button>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {status === "copied"
          ? "Guide Markdown copied to the clipboard."
          : status === "error"
            ? "Could not access the clipboard. Try copying again."
            : ""}
      </span>
      <Guide components={{ h1: () => null }} />
    </>
  );
}
