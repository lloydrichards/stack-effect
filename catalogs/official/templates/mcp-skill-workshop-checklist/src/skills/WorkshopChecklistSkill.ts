import { McpServer } from "effect/ai";

export const WorkshopChecklistSkillLive = McpServer.skill({
  uri: "skill://stack-effect/workshop-checklist/SKILL.md",
  files: {
    "SKILL.md": `---
name: workshop-checklist
description: >-
  Make a packing list for a group workshop. Use when someone needs to know how
  many kits to prepare, what to pack for each group, or which supplies to share.
license: MIT
metadata:
  author: stack-effect
  version: "1.0"
---

Ask for the number of groups and the materials each group needs.
For each item, multiply the quantity per group by the number of groups.
List each item with its quantity per group and total quantity to pack.
List shared supplies separately so they are counted once.
`,
  },
});
