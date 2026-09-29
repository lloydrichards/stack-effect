import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";
import { CatalogSources } from "./CatalogSource";

const decode = (input: unknown) =>
  Schema.decodeUnknownResult(CatalogSources)(input);

const acme = { name: "acme", url: "https://catalog.acme.dev/v1.json" };

describe("CatalogSources", () => {
  it("accepts the official source alongside a named custom source", () => {
    expect(Result.isSuccess(decode([{ name: "official" }, acme]))).toBe(true);
  });

  it("accepts plain http only on loopback hosts", () => {
    for (const url of [
      "http://localhost:4173/registry/v1/catalog.json",
      "http://127.0.0.1/catalog.json",
      "http://[::1]:8080/catalog.json",
    ])
      expect(Result.isSuccess(decode([{ name: "local", url }]))).toBe(true);
    expect(
      Result.isFailure(
        decode([{ name: "remote", url: "http://catalog.acme.dev/v1.json" }]),
      ),
    ).toBe(true);
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
  ])("rejects %s", (_, input) => {
    expect(Result.isFailure(decode(input))).toBe(true);
  });

  it("allows query strings", () => {
    expect(
      Result.isSuccess(decode([{ ...acme, url: `${acme.url}?channel=beta` }])),
    ).toBe(true);
  });
});
