import type { MermaidProps } from "mdx-mermaid/lib/Mermaid";
import { Mermaid as MdxMermaid } from "mdx-mermaid/lib/Mermaid";

const config: NonNullable<MermaidProps["config"]> = {
  theme: { light: "neutral", dark: "dark" },
  mermaid: { securityLevel: "strict" },
};

export const Mermaid = (props: MermaidProps) => (
  <div
    className="not-typeset my-6 overflow-x-auto rounded-md border border-border bg-muted p-4 [&_.mermaid_svg]:max-w-none"
    role="img"
    aria-label="Diagram"
  >
    <MdxMermaid {...props} config={config} />
  </div>
);
