import { Schema } from "effect";
import { McpSchema, McpServer } from "effect/ai";

export const workshopChecklist = {
  frontmatter: {
    name: "workshop-checklist",
    description:
      "Make a packing list for a group workshop. Use when someone needs to know how many kits to prepare, what to pack for each group, or which supplies to share.",
    license: "MIT",
    metadata: { author: "stack-effect", version: "1.0" },
  } satisfies McpSchema.SkillFrontmatter,
  instructions: `Ask for the number of groups and the materials each group needs.
For each item, multiply the quantity per group by the number of groups.
List each item with its quantity per group and total quantity to pack.
List shared supplies separately so they are counted once.`,
};

// JSON is valid YAML and preserves strings such as the skill version.
const encodeFrontmatter = Schema.encodeSync(
  Schema.fromJsonString(McpSchema.SkillFrontmatter, { space: 2 }),
);

export const WorkshopChecklistSkillLive = McpServer.skill({
  uri: `skill://stack-effect/${workshopChecklist.frontmatter.name}/SKILL.md`,
  files: {
    "SKILL.md": `---\n${encodeFrontmatter(workshopChecklist.frontmatter)}\n---\n\n${workshopChecklist.instructions}\n`,
  },
});
