import { useCallback, useEffect, useRef, useState } from "react";

export type CopyStatus = "idle" | "copied" | "error";

export function useCopyToClipboard(resetAfter = 2400) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const copy = useCallback(
    async (value: string) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      const copied = await navigator.clipboard.writeText(value).then(
        () => true,
        () => false,
      );
      if (copied) {
        setStatus("copied");
      } else {
        setStatus("error");
      }

      timeoutRef.current = setTimeout(() => setStatus("idle"), resetAfter);
      return copied;
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
