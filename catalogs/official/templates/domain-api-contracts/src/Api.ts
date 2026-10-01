import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/http-api";

export const ApiResponse = Schema.Struct({
  message: Schema.String,
  success: Schema.Literal(true),
});

export class HealthGroup extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("get", "/", { success: Schema.String }))
  .prefix("/") {}

export class HelloGroup extends HttpApiGroup.make("hello")
  .add(HttpApiEndpoint.get("get", "/", { success: ApiResponse }))
  .prefix("/hello") {}

export const Api = HttpApi.make("Api").add(HealthGroup).add(HelloGroup);
