import type { ReactNode } from "react";

export const Callout = ({ children }: { children: ReactNode }) => (
  <aside className="mb-4 rounded-md border border-border bg-muted px-4 py-3">
    {children}
  </aside>
);
