import { useRef, useState, type ComponentProps } from "react";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export const CodeBlock = ({
  children,
  className,
  ...props
}: ComponentProps<"pre">) => {
  const code = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<"Copy" | "Copied" | "Copy failed">(
    "Copy",
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.current?.textContent ?? "");
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
  };

  return (
    <div className="not-typeset mb-4 rounded-md border border-border bg-muted">
      <div className="flex justify-end border-b border-border px-2 py-1">
        <Button variant="outline" size="sm" onClick={copy}>
          <span aria-live="polite">{status}</span>
        </Button>
      </div>
      <pre
        {...props}
        ref={code}
        tabIndex={0}
        className={cn(
          "overflow-x-auto p-4 text-sm leading-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {children}
      </pre>
    </div>
  );
};
