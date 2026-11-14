import { type McpSchema, McpServer } from "effect/ai";

const frontmatter = {
  name: "workshop-checklist",
  description:
    "Make a packing list for a group workshop. Use when someone needs to know how many kits to prepare, what to pack for each group, or which supplies to share.",
  license: "MIT",
  metadata: { author: "stack-effect", version: "1.0" },
} satisfies McpSchema.SkillFrontmatter;

export const WorkshopChecklistSkillLive = McpServer.skill({
  uri: `skill://stack-effect/${frontmatter.name}/SKILL.md`,
  files: {
    "SKILL.md": `---
${JSON.stringify(frontmatter, null, 2)}
---

Ask for the number of groups and the materials each group needs.
For each item, multiply the quantity per group by the number of groups.
Use references/packing-list.md to format the checklist.
List shared supplies separately so they are counted once.
`,
    "references/packing-list.md": `| Item | Quantity per group | Number of groups | Total to pack |
| --- | ---: | ---: | ---: |

Shared supplies (one set for the whole workshop):
`,
  },
});
