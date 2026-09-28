import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Generated projects' tests live in templates and run only once scaffolded.
    exclude: ["**/node_modules/**", "**/dist/**", "templates/**"],
  },
});
