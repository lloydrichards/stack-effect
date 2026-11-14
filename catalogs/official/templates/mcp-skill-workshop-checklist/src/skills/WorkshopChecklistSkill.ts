import * as Skill from "./Skill";

export const workshopChecklist = Skill.make({
  frontmatter: {
    name: "workshop-checklist",
    description:
      "Make a packing list for a group workshop. Use when someone needs to know how many kits to prepare, what to pack for each group, or which supplies to share.",
    license: "MIT",
    metadata: { author: "stack-effect", version: "1.0" },
  },
  instructions: `Ask for the number of groups and the materials each group needs.
For each item, multiply the quantity per group by the number of groups.
Use references/packing-list.md to format the checklist.
List shared supplies separately so they are counted once.`,
  files: {
    "references/packing-list.md": `| Item | Quantity per group | Number of groups | Total to pack |
| --- | ---: | ---: | ---: |

Shared supplies (one set for the whole workshop):
`,
  },
});
