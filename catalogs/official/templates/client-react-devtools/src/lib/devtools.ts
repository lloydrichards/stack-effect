import { Layer } from "effect";
import { DevTools } from "effect/devtools";

export const DevToolsLive =
  import.meta.env.VITE_ENABLE_DEVTOOLS === "true"
    ? DevTools.layer(
        import.meta.env.VITE_DEVTOOLS_URL || "ws://localhost:34437",
      )
    : Layer.empty;
