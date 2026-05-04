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

export const RestCard = () => {
  const [response, getHello] = useAtom(helloAtom);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="font-bold text-lg">REST API</h2>
      <button
        type="button"
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        onClick={() => getHello()}
      >
        Call REST API
      </button>
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
    </div>
  );
};
`;
