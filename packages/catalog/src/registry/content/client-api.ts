export const clientHelloAtomContents = `import { Api } from "@repo/domain/Api";
import { Effect, Layer } from "effect";
import { DevTools } from "effect/unstable/devtools";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Atom } from "effect/unstable/reactivity";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:9000";
const ENABLE_DEVTOOLS = import.meta.env.VITE_ENABLE_DEVTOOLS === "true";

const ApiLayer = Layer.mergeAll(
  ENABLE_DEVTOOLS ? DevTools.layer() : Layer.empty,
);

const runtime = Atom.runtime(ApiLayer);

export const helloAtom = runtime.fn(() =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api, {
      baseUrl: SERVER_URL,
    });
    return yield* client.hello.get();
  }).pipe(Effect.provide(FetchHttpClient.layer)),
);
`;

export const clientRestCardContents = `import { useAtom } from "@effect/atom-react";
import { AsyncResult } from "effect/unstable/reactivity";
import { helloAtom } from "@/lib/atoms/hello-atom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const RestCard = () => {
  const [response, getHello] = useAtom(helloAtom);

  return (
    <Card>
      <CardHeader>
        <CardTitle>REST API</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button onClick={() => getHello()}>
          Call REST API
        </Button>
        <div className="rounded-md border border-border bg-muted/50 p-4">
          {AsyncResult.builder(response)
            .onSuccess((data) => (
              <pre className="text-sm">
                <code>
                  Message: {data.message}{"\\n"}Success: {data.success.toString()}
                </code>
              </pre>
            ))
            .onFailure((error) => (
              <pre className="text-destructive text-sm">
                <code>Error: {JSON.stringify(error, null, 2)}</code>
              </pre>
            ))
            .onInitial(() => (
              <p className="text-muted-foreground text-sm">
                Click the button above to test the REST API
              </p>
            ))
            .orNull()}
        </div>
      </CardContent>
    </Card>
  );
};
`;
