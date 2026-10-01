import { useAtom } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { tickAtom } from "@/lib/atoms/tick-atom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const RpcCard = () => {
  const [result, search] = useAtom(tickAtom);
  const event = AsyncResult.getOrElse(result, () => null);

  const handleSearch = () => {
    search({ abort: false });
  };
  return (
    <div className="flex h-full flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>RPC API</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={handleSearch}>
            Call RPC API
          </Button>
        </CardContent>
      </Card>

      <div className="flex-1 rounded-lg border border-border bg-muted/50 p-4">
        {event ? (
          <pre className="text-sm">
            <code>
              Event: {event.event._tag}
              {"\n"}
              Message: {event.text}
            </code>
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm">
            Click the button above to test the RPC API
          </p>
        )}
      </div>
    </div>
  );
};
