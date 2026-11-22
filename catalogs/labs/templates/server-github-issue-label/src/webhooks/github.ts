// @effect-diagnostics unstableApiUsage:off This adapter uses Effect Mac and HTTP responses.
import {
  ByteSize,
  Config,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
  String,
} from "effect";
import { Mac, SecureRandom } from "effect/crypto";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { chooseIssueLabel, GitHubLabels } from "./issue-label";

const IssueEvent = Schema.fromJsonString(
  Schema.Struct({
    action: Schema.String,
    repository: Schema.Struct({ full_name: Schema.NonEmptyString }),
    issue: Schema.Struct({ number: Schema.Int.check(Schema.isGreaterThan(0)) }),
  }),
);
const hex = Schema.decodeUnknownEffect(Schema.Uint8ArrayFromHex);

export const GitHubIssueWebhook = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const mac = yield* Mac.Mac;
    const labels = yield* GitHubLabels;
    const secret = yield* Config.Redacted("GITHUB_WEBHOOK_SECRET");
    const key = yield* Mac.key(
      Mac.hmacSha256,
      new TextEncoder().encode(Redacted.value(secret)),
    );

    yield* router.add("POST", "/webhooks/github", (request) =>
      Effect.gen(function* () {
        const header = request.headers["x-hub-signature-256"];
        if (header === undefined || !header.startsWith("sha256=")) {
          return HttpServerResponse.empty({ status: 401 });
        }
        const signed = yield* hex(header.slice(7)).pipe(Effect.option);
        if (Option.isNone(signed))
          return HttpServerResponse.empty({ status: 401 });

        // Bound the raw read before authenticating the delivery.
        const raw = yield* request.arrayBuffer.pipe(
          Effect.provideService(HttpServerRequest.MaxBodySize, ByteSize.kibibytes(256)),
        );
        if (!(yield* mac.verify(key, signed.value, new Uint8Array(raw)))) {
          return HttpServerResponse.empty({ status: 401 });
        }
        if (request.headers["x-github-event"] !== "issues") {
          return HttpServerResponse.empty({ status: 204 });
        }

        const event = yield* Schema.decodeEffect(IssueEvent)(
          new TextDecoder().decode(raw),
        ).pipe(Effect.option);
        if (Option.isNone(event))
          return HttpServerResponse.empty({ status: 400 });
        if (event.value.action !== "opened")
          return HttpServerResponse.empty({ status: 204 });

        return yield* labels
          .add(
            chooseIssueLabel({
              repository: event.value.repository.full_name,
              issueNumber: event.value.issue.number,
            }),
          )
          .pipe(
            Effect.match({
              onSuccess: () => HttpServerResponse.empty({ status: 204 }),
              onFailure: () => HttpServerResponse.empty({ status: 502 }),
            }),
          );
      }),
    );
  }),
).pipe(
  Layer.provide(
    Mac.layerWebCrypto.pipe(Layer.provide(SecureRandom.layerWebCrypto)),
  ),
);
