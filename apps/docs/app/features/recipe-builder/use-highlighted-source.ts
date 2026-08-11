import { useEffect, useState } from "react";
import type { HighlightedSource } from "~/lib/syntax-highlighter";

type HighlightedRequest = {
  readonly path: string;
  readonly source: string;
  readonly highlighted: HighlightedSource;
};

export function useHighlightedSource(path: string, source: string) {
  const [result, setResult] = useState<HighlightedRequest>(() => ({
    path,
    source,
    highlighted: plainSource(source),
  }));

  useEffect(() => {
    let current = true;
    void import("../../lib/syntax-highlighter")
      .then(({ highlightSource }) => highlightSource(path, source))
      .then((highlighted) => {
        if (current) setResult({ path, source, highlighted });
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [path, source]);

  return result.path === path && result.source === source
    ? result.highlighted
    : plainSource(source);
}

const plainSource = (source: string): HighlightedSource =>
  source.split("\n").map((line) => [
    {
      content: line,
      light: undefined,
      dark: undefined,
      fontStyle: undefined,
    },
  ]);
