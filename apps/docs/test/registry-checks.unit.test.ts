import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import { describe, expect } from "vitest";
import { checkRegistry } from "../scripts/registry-checks";

const base = new URL("https://registry.example");
const etag = '"abc"';

const cors = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "ETag, Last-Modified",
};

/**
 * A registry that serves `/good.json` correctly, `/bare.json` without CORS
 * or validators, and `/stale.json` with a 304 that lacks CORS headers.
 */
const StubRegistry = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) => {
    const { pathname } = new URL(request.url);
    const respond = (body: string | null, init: ResponseInit) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(request, new Response(body, init)),
      );
    if (pathname === "/good.json" || pathname === "/stale.json") {
      if (request.method === "OPTIONS")
        return respond(null, {
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-headers": "If-None-Match, If-Modified-Since",
          },
        });
      if (request.headers["if-none-match"] === etag)
        return respond(null, {
          status: 304,
          headers: pathname === "/good.json" ? { ...cors, etag } : { etag },
        });
      return respond("{}", {
        headers: {
          ...cors,
          etag,
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=0, must-revalidate",
        },
      });
    }
    if (pathname === "/bare.json")
      return respond("{}", { headers: { "content-type": "application/json" } });
    return respond("not found", { status: 404 });
  }),
);

describe("registry checks", () => {
  it.effect("pass for an asset that meets the registry HTTP contract", () =>
    Effect.gen(function* () {
      const results = yield* checkRegistry(base, ["/good.json"]);
      expect(results.filter((check) => !check.ok)).toEqual([]);
      expect(results.map((check) => check.check)).toContain("missing path 404");
    }).pipe(Effect.provide(StubRegistry)),
  );

  it.effect("reject a conditional 304 that a browser cannot read", () =>
    Effect.gen(function* () {
      const results = yield* checkRegistry(base, ["/stale.json"]);
      expect(
        results.filter((check) => !check.ok).map((check) => check.check),
      ).toEqual(["conditional 304"]);
    }).pipe(Effect.provide(StubRegistry)),
  );

  it.effect("name each broken property of a misconfigured asset", () =>
    Effect.gen(function* () {
      const results = yield* checkRegistry(base, ["/bare.json"]);
      expect(
        results.filter((check) => !check.ok).map((check) => check.check),
      ).toEqual([
        "revalidates",
        "conditional 304",
        "CORS GET",
        "CORS preflight",
      ]);
    }).pipe(Effect.provide(StubRegistry)),
  );
});
