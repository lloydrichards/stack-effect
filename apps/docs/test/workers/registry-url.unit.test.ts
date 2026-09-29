import { expect, test } from "vitest";
import { registryUrl } from "../../app/workers/recipe-builder/registry-url";

test.each([
  ["/", "https://docs.example.test/registry/v1/catalog.json"],
  [
    "/stack-effect",
    "https://docs.example.test/stack-effect/registry/v1/catalog.json",
  ],
  [
    "/stack-effect/",
    "https://docs.example.test/stack-effect/registry/v1/catalog.json",
  ],
])(
  "should resolve the catalog under the app origin when the base path is %s",
  (basePath, expected) => {
    expect(registryUrl("https://docs.example.test", basePath)).toBe(expected);
  },
);
