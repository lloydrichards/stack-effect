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

  it("accepts empty target names for apps (uses kind only)", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "server",
      name: "",
    });

    expect(identity.toKey()).toBe("apps/server");
    expect(identity.toPath()).toBe("apps/server");
    expect(identity.toPackageName()).toBe("server");
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

  describe("toPackageName", () => {
    it("returns scoped name for packages", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "package",
        name: "domain",
      });
      expect(identity.toPackageName()).toBe("@repo/domain");
    });

    it("returns kind-name for apps with names", () => {
      const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "api",
      });
      const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "client",
        name: "web",
      });

      expect(serverIdentity.toPackageName()).toBe("server-api");
      expect(clientIdentity.toPackageName()).toBe("client-web");
    });

    it("returns just kind for apps without names", () => {
      const serverIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "",
      });
      const clientIdentity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "client",
        name: "",
      });

      expect(serverIdentity.toPackageName()).toBe("server");
      expect(clientIdentity.toPackageName()).toBe("client");
    });

    it("slugifies package names", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "package",
        name: "Domain Core",
      });
      expect(identity.toPackageName()).toBe("@repo/domain-core");
    });

    it("slugifies app names", () => {
      const identity = Schema.decodeUnknownSync(TargetIdentity)({
        kind: "server",
        name: "My API",
      });
      expect(identity.toPackageName()).toBe("server-my-api");
    });
  });

  it("accepts arbitrary target kinds (extensible)", () => {
    const identity = Schema.decodeUnknownSync(TargetIdentity)({
      kind: "worker",
      name: "jobs",
    });

    expect(identity.toKey()).toBe("apps/worker-jobs");
    expect(identity.toPath()).toBe("apps/worker-jobs");
    expect(identity.toPackageName()).toBe("worker-jobs");
  });
});
