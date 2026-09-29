import { Effect } from "effect";
import {
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/unstable/http";

/** One observable property of a deployed registry asset. */
export interface RegistryCheck {
  readonly path: string;
  readonly check: string;
  readonly ok: boolean;
  readonly detail: string;
}

export const MISSING_ASSET_PATH = "/registry/v1/missing.json";

const origin = "https://registry-check.example";

// The validators the CLI and browser loaders send when revalidating a cache.
const validators = ["if-none-match", "if-modified-since"];

const result = (
  path: string,
  check: string,
  ok: boolean,
  detail: string,
): RegistryCheck => ({ path, check, ok, detail });

const header = (
  response: HttpClientResponse.HttpClientResponse,
  name: string,
) => response.headers[name.toLowerCase()] ?? "";

const includesToken = (value: string, token: string) =>
  value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .includes(token.toLowerCase());

/**
 * The HTTP contract the CLI and Recipe Builder rely on for one asset: JSON,
 * revalidation, a conditional 304, and CORS for GET and its preflight.
 */
const checkAsset = (client: HttpClient.HttpClient, base: URL, path: string) =>
  Effect.gen(function* () {
    const url = new URL(path, base).href;
    const plain = yield* client.execute(HttpClientRequest.get(url));
    const etag = header(plain, "etag");
    // Browsers revalidate cross-origin, so the 304 itself needs CORS headers.
    const conditional = yield* client.execute(
      HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeaders({ Origin: origin, "If-None-Match": etag }),
      ),
    );
    const cors = yield* client.execute(
      HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeader("Origin", origin),
      ),
    );
    const preflight = yield* client.execute(
      HttpClientRequest.options(url).pipe(
        HttpClientRequest.setHeaders({
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": validators.join(", "),
        }),
      ),
    );
    return [
      result(path, "GET 200", plain.status === 200, `status ${plain.status}`),
      result(
        path,
        "JSON content type",
        /^application\/(?:[\w.+-]+\+)?json\b/.test(
          header(plain, "content-type"),
        ),
        header(plain, "content-type") || "no content-type",
      ),
      result(
        path,
        "revalidates",
        header(plain, "cache-control").includes("must-revalidate"),
        header(plain, "cache-control") || "no cache-control",
      ),
      result(
        path,
        "conditional 304",
        etag !== "" &&
          conditional.status === 304 &&
          header(conditional, "access-control-allow-origin") === "*",
        etag === ""
          ? "no ETag"
          : `status ${conditional.status}, allow-origin "${header(conditional, "access-control-allow-origin")}"`,
      ),
      result(
        path,
        "CORS GET",
        header(cors, "access-control-allow-origin") === "*" &&
          includesToken(header(cors, "access-control-expose-headers"), "etag"),
        `allow-origin "${header(cors, "access-control-allow-origin")}", expose "${header(cors, "access-control-expose-headers")}"`,
      ),
      result(
        path,
        "CORS preflight",
        preflight.status < 300 &&
          header(preflight, "access-control-allow-origin") === "*" &&
          validators.every((validator) =>
            includesToken(
              header(preflight, "access-control-allow-headers"),
              validator,
            ),
          ),
        `status ${preflight.status}, allow-headers "${header(preflight, "access-control-allow-headers")}"`,
      ),
    ];
  });

/** Check every hosted asset and that an unknown registry path is a 404. */
export const checkRegistry = (base: URL, paths: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;
    const assets = yield* Effect.forEach(paths, (path) =>
      checkAsset(client, base, path),
    );
    const missing = yield* client.execute(
      HttpClientRequest.get(new URL(MISSING_ASSET_PATH, base).href),
    );
    return [
      ...assets.flat(),
      result(
        MISSING_ASSET_PATH,
        "missing path 404",
        missing.status === 404,
        `status ${missing.status}`,
      ),
    ];
  });
