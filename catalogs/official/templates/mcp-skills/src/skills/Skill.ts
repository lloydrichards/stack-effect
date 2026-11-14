import { Cause, Effect, Layer, Predicate, Schema } from "effect";
import { McpSchema, McpServer } from "effect/ai";

interface Definition {
  readonly frontmatter: McpSchema.SkillFrontmatter;
  readonly instructions: string;
  readonly files?: Readonly<Record<string, McpServer.SkillFile>> & {
    readonly "SKILL.md"?: never;
  };
}

// JSON flow syntax is valid YAML. Stable key order keeps the file digest stable.
const encodeFrontmatter = Schema.encodeEffect(
  Schema.fromJsonString(McpSchema.SkillFrontmatter, {
    space: 2,
    replacer: (_, value) =>
      Predicate.isObject(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, value[key]]),
          )
        : value,
  }),
);

export const make = <const D extends Definition>(definition: D) =>
  Effect.gen(function* () {
    if (definition.files && Object.hasOwn(definition.files, "SKILL.md")) {
      return yield* new Cause.IllegalArgumentError(
        "Skill.make generates SKILL.md",
      );
    }
    const header = yield* encodeFrontmatter(definition.frontmatter);
    return {
      ...definition,
      document: `---\n${header}\n---\n${definition.instructions}`,
    };
  });

export const layer = (...skills: ReadonlyArray<ReturnType<typeof make>>) =>
  Layer.effectDiscard(
    Effect.forEach(
      skills,
      (definition) =>
        Effect.gen(function* () {
          const skill = yield* definition;
          yield* McpServer.registerSkill({
            uri: `skill://stack-effect/${skill.frontmatter.name}/SKILL.md`,
            files: { ...skill.files, "SKILL.md": skill.document },
          });
        }),
      { discard: true },
    ),
  );
