import { expect, test } from "vitest";
import { registryUrl } from "../../app/workers/recipe-builder/registry-url";

test("resolves the catalog from the app origin and base path", () => {
  expect(registryUrl("https://docs.example.test", "/")).toBe(
    "https://docs.example.test/registry/v1/catalog.json",
  );
  expect(registryUrl("https://docs.example.test", "/stack-effect")).toBe(
    "https://docs.example.test/stack-effect/registry/v1/catalog.json",
  );
});
