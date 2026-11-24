{{#if effectOxlint}}import { effectNative, recommended, strict } from "@effect/tsgo/oxlint-presets";
{{/if}}import { defineConfig } from "vite-plus";

export default defineConfig({
  {{#if effectOxlint}}lint: {
    extends: [recommended, effectNative, strict],
    // Style suggestions remain visible; strict preset errors fail lint.
    options: {
      denyWarnings: false,
    },
    rules: {
      "max-depth": ["error", 3],
      "max-nested-callbacks": ["error", 4],
      "no-nested-ternary": "error",
      "typescript/array-type": [
        "error",
        { default: "generic", readonly: "generic" },
      ],
      "unicorn/prefer-array-flat-map": "error",
    },
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "effecttsgo/async-function": "off",
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/global-json": "off",
          "effecttsgo/global-json-in-effect": "off",
        },
      },
    ],
  },
  {{/if}}run: {
    cache: {
      scripts: true,
      tasks: true,
    },
  },
});
