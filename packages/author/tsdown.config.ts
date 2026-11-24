import { defineConfig } from "tsdown";

export default defineConfig({
  // One entry per published subpath. The subpaths point straight at the
  // authoring concept modules, so no per-subpath wrapper file exists.
  entry: {
    index: "src/index.ts",
    Build: "../authoring/src/Build.ts",
    Define: "../authoring/src/Define.ts",
    Official: "../authoring/src/Official.ts",
    Template: "../authoring/src/Template.ts",
  },
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
