import { assert, describe, it } from "@effect/vitest";
import { Result, Schema } from "effect";
import { CatalogSources } from "./CatalogSource";

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
