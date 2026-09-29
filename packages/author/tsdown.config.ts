import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  platform: "neutral",
  tsconfig: "../tsconfig.author-dts.json",
  dts: true,
  // Authors provide the Effect runtime and platform layers, so every `effect`
  // import stays external; private workspace code is bundled.
  deps: {
    neverBundle: [/^effect(\/|$)/],
    alwaysBundle: [/^@repo\//],
  },
});
