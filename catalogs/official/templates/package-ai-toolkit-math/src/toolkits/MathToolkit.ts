import { Effect, pipe, Schema, String } from "effect";
import { Tool, Toolkit } from "effect/ai";

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

class ArithmeticParser {
  private position = 0;

  constructor(private readonly input: string) {}

  parse() {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.position !== this.input.length) {
      throw new Error("Unexpected token at position " + (this.position + 1));
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    while (true) {
      if (this.consume("+")) value += this.parseTerm();
      else if (this.consume("-")) value -= this.parseTerm();
      else return value;
    }
  }

  private parseTerm(): number {
    let value = this.parseUnary();
    while (true) {
      if (this.consume("*", "**")) value *= this.parseUnary();
      else if (this.consume("/")) value /= this.parseUnary();
      else if (this.consume("%")) value %= this.parseUnary();
      else return value;
    }
  }

  private parsePower(): number {
    const base = this.parsePrimary();
    return this.consume("**") ? base ** this.parseUnary() : base;
  }

  private parseUnary(): number {
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePower();
  }

  private parsePrimary(): number {
    if (this.consume("(")) {
      const value = this.parseExpression();
      if (!this.consume(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    this.skipWhitespace();
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(
      this.input.slice(this.position),
    );
    if (match === null) {
      throw new Error("Expected a number at position " + (this.position + 1));
    }
    this.position += match[0].length;
    return Number(match[0]);
  }

  private consume(token: string, excludedPrefix?: string) {
    this.skipWhitespace();
    if (excludedPrefix && this.input.startsWith(excludedPrefix, this.position)) {
      return false;
    }
    if (!this.input.startsWith(token, this.position)) return false;
    this.position += token.length;
    return true;
  }

  private skipWhitespace() {
    while (/\s/.test(this.input[this.position] ?? "")) this.position += 1;
  }
}

const evaluate = (expr: string, original: string) =>
  pipe(
    Effect.try({
      try: () => new ArithmeticParser(expr).parse(),
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
