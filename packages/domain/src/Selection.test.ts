import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { DddArchitecture } from "./Catalog";
import { Selection } from "./Selection";

const classicPayload = {
  targets: [
    {
      identity: { kind: "server", name: "todo" },
      modules: [{ id: "server-http-api-todos" }],
    },
  ],
};

describe("@repo/domain Selection architecture", () => {
  it("keeps omitted and explicit Classic selections noise-free", () => {
    const omitted = Schema.decodeUnknownSync(Selection)(classicPayload);
    const explicit = Schema.decodeUnknownSync(Selection)({
      targets: [{ ...classicPayload.targets[0], architecture: "classic" }],
    });
    expect(omitted.targets[0]?.architecture).toBeUndefined();
    expect(explicit.targets[0]?.architecture).toBeUndefined();
    expect(Schema.encodeSync(Selection)(explicit)).toEqual(classicPayload);
  });

  it("propagates explicit DDD selection intent", () => {
    const selection = Schema.decodeUnknownSync(Selection)({
      targets: [{ ...classicPayload.targets[0], architecture: "ddd" }],
    });
    expect(selection.targets[0]?.architecture).toBe(DddArchitecture);
  });
});
