import { useAtom } from "@effect/atom-react";
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
                  Message: {data.message}{"\n"}Success: {data.success.toString()}
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
