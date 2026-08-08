import type {
  CliReference,
  CliReferenceArgument,
  CliReferenceCommand,
  CliReferenceFlag,
} from "./CliReference";

interface CliReferencePage {
  readonly slug: string;
  readonly content: string;
}

const generatedNotice =
  "{/* Generated from the Stack Effect CLI command tree. Do not edit directly. */}";

const escapeTableCell = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ");

const escapeCodeCell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll("\n", " ");

const inlineCode = (value: string): string => `\`${value}\``;

const codeBlock = (value: string): string => ["```sh", value, "```"].join("\n");

const section = (...parts: ReadonlyArray<string>): string =>
  parts.filter((part) => part.length > 0).join("\n\n");

const markdownTable = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>,
): string =>
  [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const flagUsage = (flag: CliReferenceFlag): string => {
  const names = [`--${flag.name}`, ...flag.aliases].join(", ");
  return flag.type === "boolean" ? names : `${names} ${flag.type}`;
};

const renderFlags = (
  title: string,
  flags: ReadonlyArray<CliReferenceFlag>,
  headingLevel: number,
): string => {
  if (flags.length === 0) return "";

  return section(
    `${"#".repeat(headingLevel)} ${title}`,
    markdownTable(
      ["Option", "Description"],
      flags.map((flag) => {
        const description = flag.description ?? "";
        const required = flag.required ? " Required." : "";
        return [
          inlineCode(escapeCodeCell(flagUsage(flag))),
          escapeTableCell(`${description}${required}`),
        ];
      }),
    ),
  );
};

const renderArguments = (
  arguments_: ReadonlyArray<CliReferenceArgument>,
  headingLevel: number,
): string => {
  if (arguments_.length === 0) return "";

  return section(
    `${"#".repeat(headingLevel)} Arguments`,
    markdownTable(
      ["Argument", "Type", "Description"],
      arguments_.map((argument) => {
        const name = `${argument.name}${argument.variadic ? "..." : ""}`;
        const description =
          argument.description ??
          (argument.required ? "Required." : "Optional.");
        return [
          inlineCode(escapeCodeCell(name)),
          inlineCode(escapeCodeCell(argument.type)),
          escapeTableCell(description),
        ];
      }),
    ),
  );
};

const renderExamples = (
  examples: CliReferenceCommand["examples"],
  headingLevel: number,
): string => {
  if (examples.length === 0) return "";

  return section(
    `${"#".repeat(headingLevel)} Examples`,
    ...examples.map((example) =>
      section(example.description ?? "", codeBlock(example.command)),
    ),
  );
};

const renderSubcommands = (
  command: CliReferenceCommand,
  headingLevel: number,
): string => {
  if (command.subcommands.length === 0) return "";

  return section(
    `${"#".repeat(headingLevel)} Subcommands`,
    markdownTable(
      ["Command", "Description"],
      command.subcommands.map((subcommand) => {
        const description =
          subcommand.shortDescription ?? subcommand.description;
        const href = `#${[...command.path, subcommand.name].join("-")}`;
        return [
          `[${inlineCode(subcommand.name)}](${href})`,
          escapeTableCell(description),
        ];
      }),
    ),
  );
};

const renderCommandSections = (
  command: CliReferenceCommand,
  headingLevel: number,
): string =>
  section(
    `${"#".repeat(headingLevel)} ${command.path.join(" ")}`,
    command.description,
    `${"#".repeat(headingLevel + 1)} Usage`,
    codeBlock(command.usage),
    renderSubcommands(command, headingLevel + 1),
    renderArguments(command.arguments, headingLevel + 1),
    renderFlags("Options", command.flags, headingLevel + 1),
    renderExamples(command.examples, headingLevel + 1),
  );

const renderCommandPage = (
  reference: CliReference,
  command: CliReferenceCommand,
): CliReferencePage => {
  const descendants = reference.commands.filter(
    (candidate) =>
      candidate.path.length > command.path.length &&
      command.path.every((part, index) => candidate.path[index] === part),
  );

  return {
    slug: command.path.slice(1).join("-"),
    content: `${section(
      generatedNotice,
      renderCommandSections(command, 1),
      ...descendants.map((descendant) => renderCommandSections(descendant, 2)),
    )}\n`,
  };
};

const renderIndexPage = (
  reference: CliReference,
  commands: ReadonlyArray<CliReferenceCommand>,
): CliReferencePage => {
  const root = reference.commands.find((command) => command.path.length === 1);

  return {
    slug: "index",
    content: `${section(
      generatedNotice,
      "# CLI reference",
      `Commands, arguments, options, and examples for ${inlineCode(`${reference.name} v${reference.version}`)}. These pages are generated from the current Effect CLI command tree.`,
      "## Commands",
      markdownTable(
        ["Command", "Description"],
        commands.map((command) => [
          `[${inlineCode(command.path.join(" "))}](/reference/cli/${command.path.slice(1).join("-")})`,
          escapeTableCell(command.description),
        ]),
      ),
      "## Usage",
      codeBlock(root?.usage ?? `${reference.name} <subcommand> [flags]`),
      renderFlags("Global options", root?.globalFlags ?? [], 2),
    )}\n`,
  };
};

export const renderCliReferencePages = (
  reference: CliReference,
): ReadonlyArray<CliReferencePage> => {
  const commands = reference.commands.filter(
    (command) => command.path.length === 2,
  );
  return [
    renderIndexPage(reference, commands),
    ...commands.map((command) => renderCommandPage(reference, command)),
  ];
};
