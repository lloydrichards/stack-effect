import { Effect, Layer, Match, pipe, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientResponse,
} from "effect/unstable/http";

const MAX_CONTENT_LENGTH = 8000;

const HTML_ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ["&nbsp;", " "],
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#039;", "'"],
];

const stripHtml = (html: string): string =>
  pipe(
    html,
    String.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ""),
    String.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ""),
    String.replace(/<[^>]+>/g, " "),
    (s) =>
      HTML_ENTITIES.reduce(
        (acc, [entity, char]) => acc.replaceAll(entity, char),
        s,
      ),
    String.replace(/\s+/g, " "),
    String.trim,
  );

const truncate = (text: string): string =>
  String.length(text) > MAX_CONTENT_LENGTH
    ? `${pipe(text, String.takeLeft(MAX_CONTENT_LENGTH))}...[truncated]`
    : text;

const fetchUrlTool = Tool.make("fetch_url", {
  description: String.stripMargin(`
    |Fetch a URL and return its content as plain text.
    |HTML is stripped automatically. Output truncated at 8000 characters.
  `),
  parameters: Schema.Struct({ url: Schema.URLFromString }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

/**
 * Retrieves content from URLs for retrieval-augmented workflows.
 * HTML is stripped automatically and output is truncated at 8000 characters.
 *
 * @module
 */
export const WebFetchToolkit = Toolkit.make(fetchUrlTool);

/** Provides its own HTTP client for network access. */
export const WebFetchToolkitLive = WebFetchToolkit.toLayer(
  Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient;

    const http = client.pipe(
      HttpClient.followRedirects(10),
      HttpClient.retryTransient({ times: 2 }),
    );

    return {
      fetch_url: (params) =>
        Effect.gen(function* () {
          yield* Effect.logDebug(`Fetching URL: ${params.url}`);

          const response = yield* pipe(
            http.get(params.url),
            Effect.flatMap(HttpClientResponse.filterStatusOk),
            Effect.mapError((error) =>
              Match.value(error.reason).pipe(
                Match.tag(
                  "TransportError",
                  () =>
                    `Network error fetching "${params.url}": connection failed or timed out`,
                ),
                Match.tag(
                  "InvalidUrlError",
                  () => `Invalid URL: "${params.url}"`,
                ),
                Match.tag(
                  "StatusCodeError",
                  (r) =>
                    `HTTP ${globalThis.String(r.response.status)} from "${params.url}"`,
                ),
                Match.orElse(
                  () => `Failed to fetch "${params.url}": ${error.message}`,
                ),
              ),
            ),
          );

          const raw = yield* pipe(
            response.text,
            Effect.mapError(
              () => `Failed to read response body from "${params.url}"`,
            ),
          );
          const contentType = String.toLowerCase(
            response.headers["content-type"] ?? "",
          );
          const text = Match.value(contentType).pipe(
            Match.when(String.includes("text/html"), () => stripHtml(raw)),
            Match.orElse(() => raw),
          );

          const result = truncate(text);

          yield* Effect.logDebug(
            `Fetched ${String.String(String.length(text))} chars from ${params.url} (returned ${String.String(String.length(result))})`,
          );

          return result;
        }),
    };
  }),
).pipe(Layer.provide(FetchHttpClient.layer));
