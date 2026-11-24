import { assert, describe, it } from "@effect/vitest";
import {
  CatalogSources,
  TargetIdentity,
  targetPathsOverlap,
} from "@repo/domain/Catalog";
import { Result, Schema } from "effect";

const decode = (input: unknown) =>
  Schema.decodeUnknownResult(CatalogSources)(input);

const acme = { name: "acme", url: "https://catalog.acme.dev/v1.json" };

describe("CatalogSources", () => {
  it("should accept the selection when the official source is paired with a named custom source", () => {
    assert.strictEqual(
      Result.isSuccess(decode([{ name: "official" }, acme])),
      true,
    );
  });

  it.each([
    "http://localhost:4173/registry/v1/catalog.json",
    "http://127.0.0.1/catalog.json",
    "http://[::1]:8080/catalog.json",
  ])(
    "should accept plain http when the url %s is on a loopback host",
    (url) => {
      assert.strictEqual(
        Result.isSuccess(decode([{ name: "local", url }])),
        true,
      );
    },
  );

  it("should reject plain http when the host is not loopback", () => {
    assert.strictEqual(
      Result.isFailure(
        decode([{ name: "remote", url: "http://catalog.acme.dev/v1.json" }]),
      ),
      true,
    );
  });

  it.each([
    ["an empty selection", []],
    ["a url on the official source", [{ name: "official", url: acme.url }]],
    ["a custom source named official", [{ ...acme, name: "official" }]],
    ["an uppercase name", [{ ...acme, name: "Acme" }]],
    ["a name longer than 32 characters", [{ ...acme, name: "a".repeat(33) }]],
    ["a relative url", [{ ...acme, url: "/registry/v1/catalog.json" }]],
    ["a file url", [{ ...acme, url: "file:///tmp/catalog.json" }]],
    ["a url fragment", [{ ...acme, url: `${acme.url}#latest` }]],
    ["credentials in the url", [{ ...acme, url: "https://me:pw@acme.dev/v1" }]],
    ["an empty host", [{ ...acme, url: "https://:443/catalog.json" }]],
    ["whitespace in the host", [{ ...acme, url: "https://acme .dev/v1.json" }]],
    [
      "a port above 65535",
      [{ ...acme, url: "https://acme.dev:99999/v1.json" }],
    ],
    ["a repeated name", [acme, { ...acme, url: "https://mirror.dev/v1.json" }]],
    ["one url under two names", [acme, { ...acme, name: "acme-mirror" }]],
    ["a repeated official entry", [{ name: "official" }, { name: "official" }]],
  ])("should reject a selection when it contains %s", (_, input) => {
    assert.strictEqual(Result.isFailure(decode(input)), true);
  });

  it("should accept the selection when the url has a query string", () => {
    assert.strictEqual(
      Result.isSuccess(decode([{ ...acme, url: `${acme.url}?channel=beta` }])),
      true,
    );
  });
});

describe("target identity placement", () => {
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
  ])("should reject an identity when its name is unsafe: %s", (name) => {
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name }),
    );
  });
  it("should reject an identity when the package name is empty or the kind is unsafe", () => {
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "package", name: "" }),
    );
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "server/sdk", name: "api" }),
    );
  });
  it("should detect overlap when directory boundaries differ only by case", () => {
    assert.strictEqual(
      targetPathsOverlap("packages/SDK", "packages/sdk/client"),
      true,
    );
    assert.strictEqual(
      targetPathsOverlap("packages/sdk", "packages/sdk-other"),
      false,
    );
  });
});

describe("TargetIdentity", () => {
  it("accepts realistic target identities users are expected to provide", () => {
    const packageIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });
    const serverIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "api",
    });
    const clientIdentity = Schema.decodeSync(TargetIdentity)({
      kind: "client-react",
      name: "admin-ui",
    });

    assert.strictEqual(packageIdentity.toKey(), "packages/domain");
    assert.strictEqual(packageIdentity.toPath(), "packages/domain");
    assert.strictEqual(serverIdentity.toKey(), "apps/server-api");
    assert.strictEqual(clientIdentity.toPath(), "apps/client-react-admin-ui");
  });

  it("accepts empty target names for apps (uses kind only)", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "",
    });

    assert.strictEqual(identity.toKey(), "apps/server");
    assert.strictEqual(identity.toPath(), "apps/server");
    assert.strictEqual(identity.toPackageName(), "server");
  });

  it("should reject a target identity when its name is a dot", () => {
    assert.throws(() =>
      Schema.decodeSync(TargetIdentity)({ kind: "client-react", name: "." }),
    );
  });

  it("slugifies uppercase names into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "API",
    });

    assert.strictEqual(identity.toKey(), "apps/server-api");
    assert.strictEqual(identity.toPath(), "apps/server-api");
  });

  it("slugifies names with spaces into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "SDK/My API",
    });

    assert.strictEqual(identity.toKey(), "apps/sdk/server-my-api");
    assert.strictEqual(identity.toPath(), "apps/sdk/server-my-api");
  });

  it("should preserve slash-separated hierarchy when deriving canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "package",
      name: "domain/core",
    });

    assert.strictEqual(identity.toKey(), "packages/domain/core");
    assert.strictEqual(identity.toPath(), "packages/domain/core");
    assert.strictEqual(identity.toPackageName(), "@repo/domain-core");
  });

  it("slugifies names with underscores into canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "client-react",
      name: "admin_ui",
    });

    assert.strictEqual(identity.toKey(), "apps/client-react-admin-ui");
    assert.strictEqual(identity.toPath(), "apps/client-react-admin-ui");
  });

  it("normalizes surrounding whitespace before deriving canonical keys and paths", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "server",
      name: "  SDK/My Api  ",
    });

    assert.strictEqual(identity.toKey(), "apps/sdk/server-my-api");
    assert.strictEqual(identity.toPath(), "apps/sdk/server-my-api");
  });

  describe("toPackageName", () => {
    it("returns scoped name for packages", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "package",
        name: "domain",
      });
      assert.strictEqual(identity.toPackageName(), "@repo/domain");
    });

    it("returns kind-name for apps with names", () => {
      const serverIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "api",
      });
      const clientIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "client-react",
        name: "web",
      });

      assert.strictEqual(serverIdentity.toPackageName(), "server-api");
      assert.strictEqual(clientIdentity.toPackageName(), "client-react-web");
    });

    it("returns just kind for apps without names", () => {
      const serverIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "",
      });
      const clientIdentity = Schema.decodeSync(TargetIdentity)({
        kind: "client-react",
        name: "",
      });

      assert.strictEqual(serverIdentity.toPackageName(), "server");
      assert.strictEqual(clientIdentity.toPackageName(), "client-react");
    });

    it("slugifies package names", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "package",
        name: "Domain Core",
      });
      assert.strictEqual(identity.toPackageName(), "@repo/domain-core");
    });

    it("slugifies app names", () => {
      const identity = Schema.decodeSync(TargetIdentity)({
        kind: "server",
        name: "My API",
      });
      assert.strictEqual(identity.toPackageName(), "server-my-api");
    });
  });

  it("accepts arbitrary target kinds (extensible)", () => {
    const identity = Schema.decodeSync(TargetIdentity)({
      kind: "worker",
      name: "jobs",
    });

    assert.strictEqual(identity.toKey(), "apps/worker-jobs");
    assert.strictEqual(identity.toPath(), "apps/worker-jobs");
    assert.strictEqual(identity.toPackageName(), "worker-jobs");
  });
});
