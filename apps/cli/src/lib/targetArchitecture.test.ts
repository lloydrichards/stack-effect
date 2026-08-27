import { Blueprint } from "@repo/domain/Blueprint";
import {
  ClassicArchitecture,
  DddArchitecture,
  ModuleId,
  TargetIdentity,
  TargetKind,
  TargetPath,
} from "@repo/domain/Catalog";
import { StackConfig } from "@repo/domain/Scaffold";
import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import {
  prospectiveConfig,
  validateArchitectureRequest,
  validateImmutableArchitecture,
} from "./targetArchitecture";

const identity = (kind: string, name: string) =>
  new TargetIdentity({ kind: TargetKind.make(kind), name });
const request = (
  kind: string,
  name: string,
  modules: ReadonlyArray<string>,
) => ({
  target: identity(kind, name),
  modules: modules.map((module) => ModuleId.make(module)),
  architecture: DddArchitecture,
});
const config = (targets?: typeof StackConfig.Type.targets) =>
  new StackConfig({
    name: "test",
    runtime: { _tag: "bun" },
    ...(targets ? { targets } : {}),
  });
const node = (
  kind: string,
  name: string,
  architecture: typeof ClassicArchitecture | typeof DddArchitecture,
) => {
  const target = identity(kind, name);
  return {
    _tag: "target" as const,
    id: target.toKey(),
    identity: target,
    architecture,
    layout: {
      path: TargetPath.make(`${kind}s/${name}`),
      packageName: `@repo/${name}`,
    },
  };
};

const failure = async (effect: Effect.Effect<unknown, unknown>) =>
  expect(Exit.isFailure(await Effect.runPromise(Effect.exit(effect)))).toBe(
    true,
  );

describe("target architecture command seams", () => {
  it("accepts exactly DDD server/api Todo HTTP and rejects extra, missing, target, and module variants", async () => {
    await expect(
      Effect.runPromise(
        validateArchitectureRequest(
          [request("server", "api", ["server-http-api-todos"])],
          DddArchitecture,
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        validateArchitectureRequest(
          [request("client-react", "web", ["client-react-http-api-todos"])],
          DddArchitecture,
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        validateArchitectureRequest(
          [
            request("server", "api", [
              "server-http-api-todos",
              "server-http-api-todos-provider-sqlite",
              "server-http-api-todos-provider-postgres",
            ]),
          ],
          DddArchitecture,
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        validateArchitectureRequest(
          [
            request("client-react", "web", ["client-react-http-api-todos"]),
            request("server", "api", ["server-http-api-todos"]),
          ],
          DddArchitecture,
        ),
      ),
    ).resolves.toBeUndefined();
    await failure(validateArchitectureRequest([], DddArchitecture));
    await failure(
      validateArchitectureRequest(
        [request("server", "other", ["server-http-api-todos"])],
        DddArchitecture,
      ),
    );
    await failure(
      validateArchitectureRequest(
        [request("server", "api", [])],
        DddArchitecture,
      ),
    );
    await failure(
      validateArchitectureRequest(
        [
          request("server", "api", [
            "server-http-api-todos",
            "server-http-api",
          ]),
        ],
        DddArchitecture,
      ),
    );
  });

  it("persists sorted DDD records, emits no Classic noise, and preserves an old manifest", () => {
    const old = config();
    expect(
      prospectiveConfig(
        old,
        new Blueprint({
          nodes: [node("server", "api", ClassicArchitecture)],
          edges: [],
        }),
      ),
    ).toEqual(old);
    const next = prospectiveConfig(
      old,
      new Blueprint({
        nodes: [
          node("server", "zeta", DddArchitecture),
          node("server", "alpha", DddArchitecture),
        ],
        edges: [],
      }),
    );
    expect(next.targets?.map((record) => record.identity.toKey())).toEqual([
      "apps/server-alpha",
      "apps/server-zeta",
    ]);
  });

  it("projects the six canonical DDD manifest records in prospective order", () => {
    const next = prospectiveConfig(
      config(),
      new Blueprint({
        nodes: [
          node("package", "todo-presentation", DddArchitecture),
          node("package", "todo-infrastructure", DddArchitecture),
          node("package", "todo-domain", DddArchitecture),
          node("package", "todo-application", DddArchitecture),
          node("package", "shared-domain", DddArchitecture),
          node("server", "api", DddArchitecture),
        ],
        edges: [],
      }),
    );

    expect(
      next.targets?.map(({ identity: target, architecture }) => ({
        identity: target.toKey(),
        architecture,
      })),
    ).toEqual([
      { identity: "apps/server-api", architecture: "ddd" },
      { identity: "packages/shared-domain", architecture: "ddd" },
      { identity: "packages/todo-application", architecture: "ddd" },
      { identity: "packages/todo-domain", architecture: "ddd" },
      { identity: "packages/todo-infrastructure", architecture: "ddd" },
      { identity: "packages/todo-presentation", architecture: "ddd" },
    ]);
  });

  it("rejects a Blueprint architecture conflict with a durable record", () => {
    const current = config([
      { identity: identity("server", "api"), architecture: DddArchitecture },
    ]);
    expect(() =>
      prospectiveConfig(
        current,
        new Blueprint({
          nodes: [node("server", "api", ClassicArchitecture)],
          edges: [],
        }),
      ),
    ).toThrow(/immutable|conflict/i);
  });

  it("allows same architecture and rejects both cross-architecture directions before writes", async () => {
    const ddd = config([
      { identity: identity("server", "api"), architecture: DddArchitecture },
    ]);
    await expect(
      Effect.runPromise(
        validateImmutableArchitecture(
          ddd,
          [request("server", "api", ["server-http-api-todos"])],
          DddArchitecture,
          new Set(["apps/server-api"]),
        ),
      ),
    ).resolves.toBeUndefined();
    await expect(
      Effect.runPromise(
        validateImmutableArchitecture(
          config(),
          [request("server", "api", ["server-http-api-todos"])],
          DddArchitecture,
          new Set(),
        ),
      ),
    ).resolves.toBeUndefined();
    await failure(
      validateImmutableArchitecture(
        config(),
        [request("server", "api", ["server-http-api-todos"])],
        DddArchitecture,
        new Set(["apps/server-api"]),
      ),
    );
    await failure(
      validateImmutableArchitecture(
        ddd,
        [
          {
            ...request("server", "api", ["server-http-api-todos"]),
            architecture: undefined,
          },
        ],
        ClassicArchitecture,
        new Set(["apps/server-api"]),
      ),
    );
  });
});
