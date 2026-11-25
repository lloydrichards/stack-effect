import { assert, describe, it } from "@effect/vitest";
import {
  CatalogSources,
  formatCatalogSources,
  isCustomCatalogSource,
  sameCatalogSources,
  selectsOfficialCatalog,
  TargetDefinition,
  TargetIdentity,
  TargetKind,
  targetPathsOverlap,
} from "@repo/domain/Catalog";
import { Result, Schema } from "effect";

const decode = (input: unknown) =>
  Schema.decodeUnknownResult(CatalogSources)(input);

const acme = { name: "acme", url: "https://catalog.acme.dev/v1.json" };

describe("CatalogSources", () => {
  it.each([
    [
      "the official source with a named custom source",
      [{ name: "official" }, acme],
    ],
    [
      "plain http on localhost",
      [
        {
          name: "local",
          url: "http://localhost:4173/registry/v1/catalog.json",
        },
      ],
    ],
    [
      "plain http on 127.0.0.1",
      [{ name: "local", url: "http://127.0.0.1/catalog.json" }],
    ],
    [
      "plain http on [::1]",
      [{ name: "local", url: "http://[::1]:8080/catalog.json" }],
    ],
    [
      "a url with a query string",
      [{ ...acme, url: `${acme.url}?channel=beta` }],
    ],
    [
      "two custom sources with different urls",
      [acme, { name: "beta", url: "https://catalog.beta.dev/v1.json" }],
    ],
  ])("should accept the selection when it contains %s", (_, input) => {
    assert.strictEqual(Result.isSuccess(decode(input)), true);
  });

  it.each([
    ["an empty selection", []],
    [
      "plain http on a non-loopback host",
      [{ name: "remote", url: "http://catalog.acme.dev/v1.json" }],
    ],
    ["a url on the official source", [{ name: "official", url: acme.url }]],
    ["an uppercase name", [{ ...acme, name: "Acme" }]],
    ["a name longer than 32 characters", [{ ...acme, name: "a".repeat(33) }]],
    ["a relative url", [{ ...acme, url: "/registry/v1/catalog.json" }]],
    ["a file url", [{ ...acme, url: "file:///tmp/catalog.json" }]],
    ["a url fragment", [{ ...acme, url: `${acme.url}#latest` }]],
    ["credentials in the url", [{ ...acme, url: "https://me:pw@acme.dev/v1" }]],
    ["a username in the url", [{ ...acme, url: "https://me@acme.dev/v1" }]],
    ["a password in the url", [{ ...acme, url: "https://:pw@acme.dev/v1" }]],
    ["an empty host", [{ ...acme, url: "https://:443/catalog.json" }]],
    ["whitespace in the host", [{ ...acme, url: "https://acme .dev/v1.json" }]],
    [
      "a port above 65535",
      [{ ...acme, url: "https://acme.dev:99999/v1.json" }],
    ],
    ["a repeated name", [acme, { ...acme, url: "https://mirror.dev/v1.json" }]],
    ["one url under two names", [acme, { ...acme, name: "acme-mirror" }]],
    ["a repeated official entry", [{ name: "official" }, { name: "official" }]],
  ])("should reject the selection when it contains %s", (_, input) => {
    assert.strictEqual(Result.isFailure(decode(input)), true);
  });
});

describe("catalog source selections", () => {
  const sources = (input: unknown) =>
    Schema.decodeUnknownSync(CatalogSources)(input);
  const official = { name: "official" };
  const mirror = { name: "acme", url: "https://mirror.acme.dev/v1.json" };

  it.each([
    {
      label: "they list the same sources in another order",
      a: [official, acme],
      b: [acme, official],
      same: true,
    },
    {
      label: "one source points at another url",
      a: [official, acme],
      b: [official, mirror],
      same: false,
    },
    {
      label: "one selection adds a source",
      a: [official],
      b: [official, acme],
      same: false,
    },
    {
      label: "one selection drops a source",
      a: [official, acme],
      b: [acme],
      same: false,
    },
  ])(
    "should report the selections as same: $same when $label",
    ({ a, b, same }) => {
      assert.strictEqual(sameCatalogSources(sources(a), sources(b)), same);
    },
  );

  it("should spell each source as the --catalog flag does when listing a selection", () => {
    assert.strictEqual(
      formatCatalogSources(sources([official, acme])),
      "official, acme=https://catalog.acme.dev/v1.json",
    );
  });

  it.each([
    {
      label: "the official source is listed",
      input: [official, acme],
      selected: true,
    },
    { label: "only custom sources are listed", input: [acme], selected: false },
  ])(
    "should report official as selected: $selected when $label",
    ({ input, selected }) => {
      assert.strictEqual(selectsOfficialCatalog(sources(input)), selected);
    },
  );

  it.each([
    { name: "acme", custom: true },
    { name: "official", custom: false },
    { name: undefined, custom: false },
  ])("should treat source $name as custom: $custom", ({ name, custom }) => {
    assert.strictEqual(isCustomCatalogSource(name), custom);
  });
});

describe("TargetDefinition", () => {
  const definition = (kind: string, defaultName: string | undefined) => ({
    kind,
    title: "Target",
    description: "A target",
    defaultName,
    contributions: [],
  });

  it.each([
    {
      label: "a package has no default name",
      kind: "package",
      defaultName: undefined,
      valid: true,
    },
    {
      label: "an app default name is empty",
      kind: "server",
      defaultName: "",
      valid: true,
    },
    {
      label: "a package default name is set",
      kind: "package",
      defaultName: "core",
      valid: true,
    },
    {
      label: "a package default name is empty",
      kind: "package",
      defaultName: "",
      valid: false,
    },
  ])(
    "should accept the definition: $valid when $label",
    ({ kind, defaultName, valid }) => {
      assert.strictEqual(
        Result.isSuccess(
          Schema.decodeUnknownResult(TargetDefinition)(
            definition(kind, defaultName),
          ),
        ),
        valid,
      );
    },
  );

  it("should drop the default finalize phase but keep any other phase when a definition is encoded again", () => {
    const codec = Schema.decodeUnknownSync(TargetDefinition);
    const decoded = codec({
      kind: "server",
      title: "Target",
      description: "A target",
      contributions: [],
      scripts: [
        { label: "install", command: "bun install" },
        { label: "format", command: "bun run format", phase: "post-finalize" },
      ],
    });

    assert.deepStrictEqual(
      decoded.scripts?.map((script) => script.phase),
      ["finalize", "post-finalize"],
    );
    assert.deepStrictEqual(
      Schema.encodeSync(TargetDefinition)(decoded).scripts?.map(
        (script) => script.phase,
      ),
      [undefined, "post-finalize"],
    );
  });
});

describe("TargetIdentity", () => {
  it.each([
    {
      label: "a package",
      kind: "package",
      name: "domain",
      key: "packages/domain",
      packageName: "@repo/domain",
    },
    {
      label: "a server app",
      kind: "server",
      name: "api",
      key: "apps/server-api",
      packageName: "server-api",
    },
    {
      label: "a hyphenated client app",
      kind: "client-react",
      name: "admin-ui",
      key: "apps/client-react-admin-ui",
      packageName: "client-react-admin-ui",
    },
    {
      label: "a whitespace-only app name",
      kind: "server",
      name: "   ",
      key: "apps/server",
      packageName: "server",
    },
    {
      label: "the workspace root",
      kind: "workspace",
      name: "",
      key: ".",
      packageName: "workspace",
    },
    {
      label: "a name that merely ends with a reserved device word",
      kind: "package",
      name: "falcon",
      key: "packages/falcon",
      packageName: "@repo/falcon",
    },
    {
      label: "a name that merely starts with a reserved device word",
      kind: "package",
      name: "console",
      key: "packages/console",
      packageName: "@repo/console",
    },
    {
      label: "an unnamed server app",
      kind: "server",
      name: "",
      key: "apps/server",
      packageName: "server",
    },
    {
      label: "an unnamed client app",
      kind: "client-react",
      name: "",
      key: "apps/client-react",
      packageName: "client-react",
    },
    {
      label: "an uppercase name",
      kind: "server",
      name: "API",
      key: "apps/server-api",
      packageName: "server-api",
    },
    {
      label: "a name with spaces",
      kind: "server",
      name: "My API",
      key: "apps/server-my-api",
      packageName: "server-my-api",
    },
    {
      label: "a package name with spaces",
      kind: "package",
      name: "Domain Core",
      key: "packages/domain-core",
      packageName: "@repo/domain-core",
    },
    {
      label: "a name with underscores",
      kind: "client-react",
      name: "admin_ui",
      key: "apps/client-react-admin-ui",
      packageName: "client-react-admin-ui",
    },
    {
      label: "a nested package name",
      kind: "package",
      name: "domain/core",
      key: "packages/domain/core",
      packageName: "@repo/domain-core",
    },
    {
      label: "a nested app name with spaces",
      kind: "server",
      name: "SDK/My API",
      key: "apps/sdk/server-my-api",
      packageName: "server-sdk-my-api",
    },
    {
      label: "a name with surrounding whitespace",
      kind: "server",
      name: "  SDK/My Api  ",
      key: "apps/sdk/server-my-api",
      packageName: "server-sdk-my-api",
    },
    {
      label: "a kind outside the official catalog",
      kind: "worker",
      name: "jobs",
      key: "apps/worker-jobs",
      packageName: "worker-jobs",
    },
  ])(
    "should derive the canonical key, path, and package name when the identity is $label",
    ({ kind, name, key, packageName }) => {
      const identity = Schema.decodeSync(TargetIdentity)({ kind, name });

      assert.deepStrictEqual(
        {
          key: identity.toKey(),
          path: identity.toPath(),
          packageName: identity.toPackageName(),
        },
        { key, path: key, packageName },
      );
    },
  );

  it.each([
    { kind: "package", name: "/api" },
    { kind: "package", name: "sdk/" },
    { kind: "package", name: "sdk//api" },
    { kind: "package", name: "sdk/.." },
    { kind: "package", name: "sdk/.hidden" },
    { kind: "package", name: "sdk/node_modules" },
    { kind: "package", name: "sdk/CON" },
    { kind: "package", name: "sdk/???" },
    { kind: "package", name: "sdk\\api" },
    { kind: "package", name: "sdk/api:bad" },
    { kind: "package", name: "" },
    { kind: "client-react", name: "." },
    { kind: "package", name: "   " },
    { kind: "server/sdk", name: "api" },
    { kind: "Server", name: "api" },
    { kind: "client_react", name: "web" },
  ])(
    "should reject the identity when kind $kind or name '$name' is unsafe",
    (input) => {
      assert.throws(() => Schema.decodeSync(TargetIdentity)(input));
    },
  );

  const myApi = new TargetIdentity({
    kind: TargetKind.make("server"),
    name: "My Api",
  });

  it.each([
    {
      label: "the selector names the same kind",
      selector: { _tag: "kind", kind: TargetKind.make("server") },
      matches: true,
    },
    {
      label: "the selector names the same identity before normalization",
      selector: {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("server"),
          name: "my-api",
        }),
      },
      matches: true,
    },
    {
      label: "the selector names another kind",
      selector: { _tag: "kind", kind: TargetKind.make("client-react") },
      matches: false,
    },
    {
      label: "the selector names the same name under another kind",
      selector: {
        _tag: "identity",
        identity: new TargetIdentity({
          kind: TargetKind.make("client-react"),
          name: "my-api",
        }),
      },
      matches: false,
    },
  ] as const)(
    "should report a match of $matches when $label",
    ({ selector, matches }) => {
      assert.strictEqual(myApi.matches(selector), matches);
    },
  );

  it.each([
    {
      label: "the paths are equal",
      left: "packages/sdk",
      right: "packages/sdk",
      overlaps: true,
    },
    {
      label: "the paths differ only by case",
      left: "packages/SDK",
      right: "packages/sdk/client",
      overlaps: true,
    },
    {
      label: "the first path is nested in the second",
      left: "packages/sdk/client",
      right: "packages/sdk",
      overlaps: true,
    },
    {
      label: "the paths only share a name prefix",
      left: "packages/sdk",
      right: "packages/sdk-other",
      overlaps: false,
    },
  ])(
    "should report overlap of $overlaps when $label",
    ({ left, right, overlaps }) => {
      assert.strictEqual(targetPathsOverlap(left, right), overlaps);
    },
  );
});
