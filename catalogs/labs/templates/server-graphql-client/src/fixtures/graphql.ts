// @effect-diagnostics nodeBuiltinImport:off Bun, Node, and Deno all support this HTTP fixture adapter.
import { UpstreamItemId } from "@repo/domain/UpstreamItem";
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { Effect, Schema } from "effect";

const fixtureHost = "127.0.0.1";
const fixturePort = 9010;
const fixturePath = "/graphql";

const FindItemRequest = Schema.fromJsonString(
  Schema.Struct({
    operationName: Schema.Literal("FindItem"),
    query: Schema.NonEmptyString,
    variables: Schema.Struct({ id: UpstreamItemId }),
  }),
);

const responseForItem = (id: UpstreamItemId) => {
  switch (id) {
    case "http-error":
      return new Response("Upstream unavailable", { status: 503 });
    case "graphql-error":
      return Response.json({ errors: [{ message: "Lookup failed" }] });
    case "invalid-data":
      return Response.json({ data: { item: { id, name: 123 } } });
    case "demo":
      return Response.json({ data: { item: { id, name: "Demo item" } } });
    default:
      return Response.json({ data: { item: null } });
  }
};

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== fixturePath) {
    response.writeHead(404).end();
    return;
  }

  const decodeRequest = Effect.tryPromise(() => text(request)).pipe(
    Effect.flatMap(Schema.decodeEffect(FindItemRequest)),
  );

  void Effect.runPromise(
    Effect.gen(function* () {
      const result = yield* Effect.match(decodeRequest, {
        onFailure: () =>
          Response.json(
            { errors: [{ message: "Expected FindItem" }] },
            { status: 400 },
          ),
        onSuccess: ({ variables }) => responseForItem(variables.id),
      });

      const body = yield* Effect.promise(() => result.text());

      response
        .writeHead(result.status, Object.fromEntries(result.headers))
        .end(body);
    }),
  );
}).listen(fixturePort, fixtureHost);
