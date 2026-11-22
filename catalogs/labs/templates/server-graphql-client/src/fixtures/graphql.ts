// @effect-diagnostics nodeBuiltinImport:off Bun, Node, and Deno all support this HTTP fixture adapter.
import { createServer } from "node:http";
import { text } from "node:stream/consumers";
import { Effect, Schema } from "effect";

const FindItemRequest = Schema.fromJsonString(
  Schema.Struct({
    operationName: Schema.Literal("FindItem"),
    query: Schema.NonEmptyString,
    variables: Schema.Struct({ id: Schema.String }),
  }),
);

createServer((request, response) => {
  if (request.method !== "POST" || request.url !== "/graphql") {
    response.writeHead(404).end();
    return;
  }

  void Effect.runPromise(
    Effect.tryPromise(() => text(request)).pipe(
      Effect.flatMap(Schema.decodeEffect(FindItemRequest)),
      Effect.match({
        onFailure: () =>
          Response.json(
            { errors: [{ message: "Expected FindItem" }] },
            { status: 400 },
          ),
        onSuccess: ({ variables: { id } }) => {
          switch (id) {
            case "http-error":
              return new Response("Upstream unavailable", { status: 503 });
            case "graphql-error":
              return Response.json({ errors: [{ message: "Lookup failed" }] });
            case "invalid-data":
              return Response.json({ data: { item: { id, name: 123 } } });
            case "demo":
              return Response.json({
                data: { item: { id, name: "Demo item" } },
              });
            default:
              return Response.json({ data: { item: null } });
          }
        },
      }),
      Effect.flatMap((result) =>
        Effect.promise(() => result.text()).pipe(
          Effect.map((body) =>
            response
              .writeHead(result.status, Object.fromEntries(result.headers))
              .end(body),
          ),
        ),
      ),
    ),
  );
}).listen(9010, "127.0.0.1");
