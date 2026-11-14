{{#if effectOxlint}}import { effectNative, recommended } from "@effect/tsgo/oxlint-presets";
{{/if}}import { defineConfig } from "vite-plus";

export default defineConfig({
  {{#if effectOxlint}}lint: {
    extends: [recommended, effectNative],
    // Keep new advisory rules opt-in for generated projects.
    rules: {
      "effecttsgo/unstable-api-usage": "off",
      "effecttsgo/experimental-api-usage": "off",
      "effecttsgo/schema-class-missing-brand": "off",
      "effecttsgo/prefer-effect-array": "off",
      "effecttsgo/prefer-effect-string": "off",
      "effecttsgo/prefer-effect-record": "off",
      "effecttsgo/option-match-to-from-option": "off",
      "effecttsgo/all-of-map-to-for-each": "off",
    },
    options: {
      denyWarnings: true,
    },
    overrides: [
      {
        files: ["**/src/components/rest-card.tsx", "**/src/components/chat-box.tsx", "**/src/features/rest.ts", "**/src/features/chat.ts"],
        // Rendering and TEA updates synchronously encode schema-validated state.
        rules: {
          "effecttsgo/global-json": "off",
          "effecttsgo/schema-sync": "off",
        },
      },

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
