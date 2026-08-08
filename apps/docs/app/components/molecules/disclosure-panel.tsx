"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";

type DisclosurePanelProps = {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly keepMounted?: boolean;
  readonly children: ReactNode;
  readonly headingLevel?: "h2" | "h3" | "h4";
};

export function DisclosurePanel({
  title,
  description,
  meta,
  actions,
  defaultOpen = false,
  keepMounted = false,
  children,
  headingLevel: Heading = "h2",
}: DisclosurePanelProps) {
  const titleId = useId();

  return (
    <section
      className="overflow-hidden rounded-md border bg-card"
      aria-labelledby={titleId}
    >
      <Collapsible defaultOpen={defaultOpen}>
        <header className="flex min-h-12 items-center">
          <Heading
            className="m-0 flex min-w-0 flex-1"
            aria-labelledby={titleId}
          >
            <CollapsibleTrigger className="group flex min-h-12 min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none md:px-5">
              <span
                id={titleId}
                className="min-w-0 truncate font-heading text-base font-semibold"
              >
                {title}
              </span>
              {description ? (
                <span className="sr-only">{description}</span>
              ) : null}
              <span className="flex shrink-0 items-center gap-3">
                {meta}
                <ChevronDown className="text-muted-foreground transition-transform group-data-panel-open:rotate-180" />
              </span>
            </CollapsibleTrigger>
          </Heading>
          {actions ? (
            <div className="flex shrink-0 items-center pr-2">{actions}</div>
          ) : null}
        </header>
        <CollapsibleContent keepMounted={keepMounted}>
          <div className="border-t">{children}</div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
