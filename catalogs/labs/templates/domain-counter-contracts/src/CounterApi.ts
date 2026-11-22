import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/http-api";
import { CounterId, CounterState } from "./Counter";

export class CounterUnavailable extends Schema.TaggedError<
  CounterUnavailable,
  { readonly brand: unique symbol }
>()("CounterUnavailable", {}) {}

const Counters = HttpApiGroup.make("counters")
  .add(
    HttpApiEndpoint.post("increment", "/:id/increment", {
      params: { id: CounterId },
      success: CounterState,
      error: CounterUnavailable.pipe(HttpApiSchema.status(503)),
    }),
  )
  .prefix("/counters");

export const CounterApi = HttpApi.make("CounterApi").add(Counters);
