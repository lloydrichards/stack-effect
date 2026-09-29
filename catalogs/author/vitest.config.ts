import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Template files are embedded in the catalog and never run here.
    exclude: ["**/node_modules/**", "**/dist/**", "templates/**"],
  },
});
