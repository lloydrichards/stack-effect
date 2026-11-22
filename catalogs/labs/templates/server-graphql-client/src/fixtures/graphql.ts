import { Effect, Schema } from "effect";

const FindItemRequest = Schema.Struct({
  operationName: Schema.Literal("FindItem"),
  query: Schema.NonEmptyString,
  variables: Schema.Struct({ id: Schema.String }),
});

Bun.serve({
  hostname: "127.0.0.1",
  port: 9010,
  routes: {
    "/graphql": {
      POST: (request) =>
        Effect.tryPromise(() => request.json()).pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(FindItemRequest)),
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
                  return Response.json({
                    errors: [{ message: "Lookup failed" }],
                  });
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
          Effect.runPromise,
        ),
    },
  },
});
