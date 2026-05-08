# @repo/observability

Shared OpenTelemetry layer for stack-effect services.

## Role

Centralizes OTEL configuration so any Effect app in the monorepo can enable tracing by setting environment variables. No-ops when variables are absent.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector URL |
| `OTEL_SERVICE_NAME` | Service identifier for traces |

## Usage

```typescript
import { ObservabilityLive } from "@repo/observability";

const AppLive = MyApp.pipe(
  Layer.provideMerge(ObservabilityLive),
);
```
