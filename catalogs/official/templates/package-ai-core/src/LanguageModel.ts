import { AnthropicClient, AnthropicLanguageModel } from "@effect/ai-anthropic";
import { Config, Layer } from "effect";
import { FetchHttpClient } from "effect/http";

const AnthropicClientLayer = AnthropicClient.layerConfig({
  apiKey: Config.Redacted("ANTHROPIC_API_KEY"),
}).pipe(Layer.provide(FetchHttpClient.layer));

export const SmartModelLayer = AnthropicLanguageModel.model(
  "claude-sonnet-4-5",
).pipe(Layer.provide(AnthropicClientLayer));

export const FastModelLayer = AnthropicLanguageModel.model(
  "claude-haiku-4-5",
).pipe(Layer.provide(AnthropicClientLayer));
