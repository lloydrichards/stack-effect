import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { TargetIdentity } from "./Catalog";

describe("@repo/domain Scaffold", () => {
  it("accepts realistic target identities users are expected to provide", () => {
    const packageIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain",
    });
    const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "api",
    });
    const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "client",
      name: "admin-ui",
    });

    expect(packageIdentity.toKey()).toBe("packages/domain");
    expect(packageIdentity.toPath()).toBe("packages/domain");
    expect(serverIdentity.toKey()).toBe("apps/server-api");
    expect(clientIdentity.toPath()).toBe("apps/client-admin-ui");
  });

  it("rejects empty target names", () => {
    expect(() =>
      Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "",
      }),
    ).toThrow();
  });

  it("slugifies uppercase names into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "API",
    });

    expect(identity.toKey()).toBe("apps/server-api");
    expect(identity.toPath()).toBe("apps/server-api");
  });

  it("slugifies names with spaces into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "my api",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
  });

  it("slugifies names with slashes into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "package",
      name: "domain/core",
    });

    expect(identity.toKey()).toBe("packages/domain-core");
    expect(identity.toPath()).toBe("packages/domain-core");
  });

  it("slugifies names with underscores into canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "client",
      name: "admin_ui",
    });

    expect(identity.toKey()).toBe("apps/client-admin-ui");
    expect(identity.toPath()).toBe("apps/client-admin-ui");
  });

  it("normalizes surrounding whitespace before deriving canonical keys and paths", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "  My Api  ",
    });

    expect(identity.toKey()).toBe("apps/server-my-api");
    expect(identity.toPath()).toBe("apps/server-my-api");
  });

  it("rejects unsupported target kinds", () => {
    expect(() =>
      Schema.decodeUnknownSync(TargetIdentity)({
        kind: "worker",
        name: "jobs",
      }),
    ).toThrow();
  });
});
