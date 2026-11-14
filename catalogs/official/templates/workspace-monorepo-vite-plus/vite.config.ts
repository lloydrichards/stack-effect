{{#if effectOxlint}}import { effectNative, recommended, strict } from "@effect/tsgo/oxlint-presets";
{{/if}}import { defineConfig } from "vite-plus";

export default defineConfig({
  {{#if effectOxlint}}lint: {
    extends: [recommended, effectNative, strict],
    // Style suggestions remain visible; strict preset errors fail lint.
    options: {
      denyWarnings: false,
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
