import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TargetIdentity, targetPathsOverlap } from "./Catalog";

describe("target identity placement", () => {
  it.each([
    ["server", "api", "apps/server-api", "server-api"],
    ["server", "SDK/My API", "apps/sdk/server-my-api", "server-sdk-my-api"],
    ["package", "sdk/client", "packages/sdk/client", "@repo/sdk-client"],
    ["server", "", "apps/server", "server"],
    ["workspace", "My Project", ".", "my-project"],
  ])("derives %s %s consistently", (kind, name, path, npmName) => {
    const identity = Schema.decodeSync(TargetIdentity)({ kind, name });
    expect(identity.toPath()).toBe(path);
    expect(identity.toKey()).toBe(path);
    expect(identity.toPackageName()).toBe(npmName);
  });
  it.each([
    "/api",
    "sdk/",
    "sdk//api",
    "sdk/..",
    "sdk/.hidden",
    "sdk/node_modules",
    "sdk/CON",
    "sdk/???",
    "sdk\\api",
    "sdk/api:bad",
  ])("rejects unsafe name %s", (name) => {
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name }),
    ).toThrow();
  });
  it("requires a package name and safe kind", () => {
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name: "" }),
    ).toThrow();
    expect(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "server/sdk", name: "api" }),
    ).toThrow();
  });
  it("distinguishes hierarchical identities while retaining flat npm names", () => {
    const nested = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "sdk/api",
    });
    const flat = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "sdk-api",
    });
    expect(nested.toKey()).not.toBe(flat.toKey());
    expect(nested.toPackageName()).toBe(flat.toPackageName());
  });
  it("checks overlap at case-insensitive directory boundaries", () => {
    expect(targetPathsOverlap("packages/SDK", "packages/sdk/client")).toBe(
      true,
    );
    expect(targetPathsOverlap("packages/sdk", "packages/sdk-other")).toBe(
      false,
    );
  });
});
