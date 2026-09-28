{{#if effectOxlint}}import { effectNative, recommended } from "@effect/tsgo/oxlint-presets";
{{/if}}import { defineConfig } from "vite-plus";

export default defineConfig({
  {{#if effectOxlint}}lint: {
    extends: [recommended, effectNative],
    options: {
      denyWarnings: true,
    },
    overrides: [
      {
        files: ["**/*.test.ts", "**/*.test.tsx"],
        rules: {
          "effecttsgo/async-function": "off",
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/prefer-schema-over-json": "off",
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
