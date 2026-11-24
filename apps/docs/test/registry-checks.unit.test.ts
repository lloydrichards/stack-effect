import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { checkRegistry } from "../scripts/registry-checks";

const base = new URL("https://registry.example");
const etag = '"abc"';

const cors = {
  "access-control-allow-origin": "*",
  "access-control-expose-headers": "ETag, Last-Modified",
};

/**
 * A registry that serves `/good.json` correctly, `/plain.json` correctly but
 * as text, `/bare.json` without CORS or validators, and `/stale.json` with a
 * 304 that lacks CORS headers. Unknown paths return `missingStatus`.
 */
const stubRegistry = (missingStatus = 404) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      const { pathname } = new URL(request.url);
      const respond = (body: string | null, init: ResponseInit) =>
        Effect.succeed(
          HttpClientResponse.fromWeb(request, new Response(body, init)),
        );
      if (
        pathname === "/good.json" ||
        pathname === "/plain.json" ||
        pathname === "/stale.json"
      ) {
        if (request.method === "OPTIONS")
          return respond(null, {
            status: 204,
            headers: {
              ...cors,
              "access-control-allow-headers":
                "If-None-Match, If-Modified-Since",
            },
          });
        if (request.headers["if-none-match"] === etag)
          return respond(null, {
            status: 304,
            headers: pathname === "/stale.json" ? { etag } : { ...cors, etag },
          });
        return respond("{}", {
          headers: {
            ...cors,
            etag,
            "content-type":
              pathname === "/plain.json"
                ? "text/plain; charset=utf-8"
                : "application/json; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
          },
        });
      }
      if (pathname === "/bare.json")
        return respond("{}", {
          headers: { "content-type": "application/json" },
        });
      return respond("not found", { status: missingStatus });
    }),
  );

const failedChecks = (
  results: ReadonlyArray<{ readonly check: string; readonly ok: boolean }>,
) => results.filter((check) => !check.ok).map((check) => check.check);

describe("registry checks", () => {
  it.effect(
    "should pass every check when an asset meets the registry HTTP contract",
    () =>
      Effect.gen(function* () {
        const results = yield* checkRegistry(base, ["/good.json"]);
        assert.deepStrictEqual(failedChecks(results), []);
        assert.include(
          results.map((check) => check.check),
          "missing path 404",
        );
      }).pipe(Effect.provide(stubRegistry())),
  );

  it.effect(
    "should reject the conditional 304 when a browser cannot read it",
    () =>
      Effect.gen(function* () {
        const results = yield* checkRegistry(base, ["/stale.json"]);
        assert.deepStrictEqual(failedChecks(results), ["conditional 304"]);
      }).pipe(Effect.provide(stubRegistry())),
  );

  it.effect(
    "should name each broken property when an asset is misconfigured",
    () =>
      Effect.gen(function* () {
        const results = yield* checkRegistry(base, ["/bare.json"]);
        assert.deepStrictEqual(failedChecks(results), [
          "revalidates",
          "conditional 304",
          "CORS GET",
          "CORS preflight",
        ]);
      }).pipe(Effect.provide(stubRegistry())),
  );

  it.effect(
    "should reject the content type when an asset is not served as JSON",
    () =>
      Effect.gen(function* () {
        const results = yield* checkRegistry(base, ["/plain.json"]);
        assert.deepStrictEqual(failedChecks(results), ["JSON content type"]);
      }).pipe(Effect.provide(stubRegistry())),
  );

  it.effect(
    "should fail the missing-path check when an unknown path returns 200",
    () =>
      Effect.gen(function* () {
        const results = yield* checkRegistry(base, ["/good.json"]);
        assert.deepStrictEqual(failedChecks(results), ["missing path 404"]);
      }).pipe(Effect.provide(stubRegistry(200))),
  );
});
