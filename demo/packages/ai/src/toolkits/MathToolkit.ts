import { Effect, pipe, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/unstable/ai";

const SAFE_EXPRESSION_PATTERN = /^[\d\s+\-*/().,%^e]+$/;

const MathExpression = Schema.String.check(
  Schema.isNonEmpty({ message: "Expression cannot be empty" }),
  Schema.isTrimmed({
    message: "Expression must not have leading/trailing whitespace",
  }),
  Schema.isPattern(SAFE_EXPRESSION_PATTERN, {
    description: String.stripMargin(`
      |Only digits, arithmetic operators (+, -, *, /, %, ^), 
      |parentheses, and decimal points are allowed
    `),
  }),
).annotate({
  title: "MathExpression",
  description: String.stripMargin(`
    |An arithmetic expression using numbers and operators.
    |Supports: +, -, *, /, % (modulo), ^ or ** (exponent), parentheses.
  `),
  examples: ["(42 * 3.14) / 7", "2 ^ 10", "100 % 7", "3.14 * (2 + 1)"],
});

const calculateTool = Tool.make("calculate", {
  description: String.stripMargin(`
    |Evaluate an arithmetic expression deterministically. Use instead of
    |mental math. Supports: +, -, *, /, % (modulo), ** (exponent), parentheses.
  `),
  parameters: Schema.Struct({
    expression: MathExpression,
  }),
  success: Schema.String,
  failure: Schema.String,
  failureMode: "return",
});

const normalize = String.replaceAll("^", "**");

const evaluate = (expr: string, original: string) =>
  pipe(
    Effect.try({
      try: () => new Function(`return (${expr})`)() as unknown,
      catch: (cause) =>
        `Failed to evaluate expression '${original}': ${cause instanceof Error ? cause.message : globalThis.String(cause)}`,
    }),
    Effect.filterOrFail(
      (result): result is number =>
        typeof result === "number" && Number.isFinite(result),
      (result) =>
        `Expression did not produce a finite number: '${original}' = ${globalThis.String(result)}`,
    ),
  );

/**
 * Evaluates arithmetic expressions deterministically.
 * Models are unreliable at mental math; this offloads computation
 * to a safe evaluator restricted to numeric operators.
 *
 * @module
 */
export const MathToolkit = Toolkit.make(calculateTool);

export const MathToolkitLive = MathToolkit.toLayer(
  Effect.succeed({
    calculate: (params) =>
      Effect.gen(function* () {
        const expr = params.expression;
        const normalized = normalize(expr);
        const result = yield* evaluate(normalized, expr);

        yield* Effect.logDebug(`Calculate: ${expr} = ${result}`);
        return globalThis.String(result);
      }),
  }),
);
