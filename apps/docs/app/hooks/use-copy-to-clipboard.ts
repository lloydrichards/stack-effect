import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "error";

export function useCopyToClipboard(resetAfter = 2400) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const copy = useCallback(
    async (value: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      try {
        await navigator.clipboard.writeText(value);
        setStatus("copied");
      } catch {
        setStatus("error");
      }

      timeoutRef.current = setTimeout(() => setStatus("idle"), resetAfter);
    },
    [resetAfter],
  );
  const reset = useCallback(() => setStatus("idle"), []);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  return { status, copy, reset };
}
