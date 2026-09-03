import type { MermaidProps } from "mdx-mermaid/lib/Mermaid";
import { Mermaid as MdxMermaid } from "mdx-mermaid/lib/Mermaid";

export function Mermaid(props: MermaidProps) {
  return (
    <div
      className="my-6 overflow-x-auto rounded-md border border-border bg-muted/50 p-4 text-foreground dark:bg-muted/30 [&_.mermaid]:m-0 [&_.mermaid]:flex [&_.mermaid]:min-w-max [&_.mermaid]:justify-center [&_.mermaid_svg]:max-w-none"
      role="img"
      aria-label="Diagram"
    >
      <MdxMermaid
        config={{
          theme: {
            light: "neutral",
            dark: "dark",
          },
          mermaid: {
            securityLevel: "strict",
          },
        }}
        {...props}
      />
    </div>
  );
}
