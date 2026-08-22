import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { StackConfig } from "./Scaffold";

const base = { name: "demo", runtime: { _tag: "bun" as const } };

describe("StackConfig infrastructure", () => {
  it("defaults absent infrastructure to effective none and encodes it absent", () => {
    const config = Schema.decodeSync(StackConfig)(base);
    expect(config.effectiveInfrastructure).toBe("none");
    expect(Schema.encodeSync(StackConfig)(config)).toEqual(base);
  });

  it("canonicalizes persisted explicit none to the exact absent/default bytes", () => {
    const encodePersisted = Schema.encodeSync(
      Schema.fromJsonString(StackConfig),
    );
    const absent = encodePersisted(Schema.decodeSync(StackConfig)(base));
    const explicitNone = encodePersisted(
      Schema.decodeSync(StackConfig)({ ...base, infrastructure: "none" }),
    );

    expect(explicitNone).toBe(absent);
    expect(explicitNone).toBe('{"name":"demo","runtime":{"_tag":"bun"}}');
  });

  it("accepts explicit none and Cloudflare without accepting unknown providers", () => {
    const explicitNone = Schema.decodeSync(StackConfig)({
      ...base,
      infrastructure: "none",
    });
    expect(explicitNone.effectiveInfrastructure).toBe("none");
    expect(Schema.encodeSync(StackConfig)(explicitNone)).toEqual(base);
    expect(
      Schema.decodeSync(StackConfig)({ ...base, infrastructure: "cloudflare" })
        .effectiveInfrastructure,
    ).toBe("cloudflare");
    expect(() =>
      Schema.decodeUnknownSync(StackConfig)({ ...base, infrastructure: "aws" }),
    ).toThrow(/none.*cloudflare|cloudflare.*none/);
  });
});
