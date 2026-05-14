export const cliPackageJsonContents = `{
  "name": "{{packageName}}",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "bin": {
    "{{packageName}}": "dist/index.js"
  },
  "scripts": {},
  "dependencies": {
    "@effect/platform-bun": "4.0.0-beta.65",
    "effect": "4.0.0-beta.65"
  },
  "devDependencies": {
    "@effect/language-service": "^0.85.1",
    "@repo/config-typescript": "workspace:*",
    "@types/bun": "^1.2.17",
    "typescript": "6.0.2",
    "vitest": "^4.1.4"
  }
}
`;

export const cliTsconfigContents = `{
  "extends": "@repo/config-typescript/base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "dist",
    "noEmit": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
`;

/**
 * CLI index template with Effect CLI.
 *
 * This is a minimal CLI entrypoint that includes:
 * - A root command with version flag
 * - BunRuntime for execution
 *
 * Additional subcommands are added by modules.
 */
export const cliIndexContents = `import { BunRuntime } from "@effect/platform-bun";
import { Command } from "effect/unstable/cli";

// ============================================================================
// Root Command
// ============================================================================

const root = Command.make("{{packageName}}");

// ============================================================================
// Program
// ============================================================================

// Subcommands - modules inject additional subcommands via Command.withSubcommands
const AllCommands = Command.withSubcommands([]);

const program = root.pipe(
  AllCommands,
  Command.run({ version: "0.0.0" }),
);

BunRuntime.runMain(program);
`;

/**
 * Hello command module template.
 *
 * A simple subcommand that prints a greeting message.
 */
export const cliHelloCommandContents = `import { Console, Effect } from "effect";
import { Argument, Command, Flag } from "effect/unstable/cli";

const name = Argument.text({ name: "name" }).pipe(
  Argument.optional,
);

const shout = Flag.boolean("shout").pipe(
  Flag.withDescription("Print the greeting in uppercase"),
  Flag.optional,
);

export const hello = Command.make("hello", { name, shout }, ({ name, shout }) =>
  Effect.gen(function* () {
    const greeting = \`Hello, \${name ?? "World"}!\`;
    yield* Console.log(shout ? greeting.toUpperCase() : greeting);
  }),
).pipe(Command.withDescription("Print a greeting message"));
`;
