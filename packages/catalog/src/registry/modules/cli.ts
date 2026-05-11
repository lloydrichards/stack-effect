import {
  type ModuleDefinition,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import { cliHelloCommandContents } from "../content/cli";

/**
 * CLI modules - subcommands and services for CLI applications
 */
export const cliModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("hello-command"),
    title: "Hello Command",
    description: "A simple hello-world subcommand for the CLI",
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("cli") }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/src/commands/hello.ts",
        contents: cliHelloCommandContents,
      },
      {
        _tag: "ts-call-arg",
        path: "{{targetPath}}/src/index.ts",
        targetVariable: "AllCommands",
        functionName: "Command.withSubcommands",
        argument: "hello",
        import: {
          moduleSpecifier: "./commands/hello",
          namedImports: ["hello"],
        },
      },
    ],
  },
];
