import { McpServer } from "effect/ai";

export const WorkshopChecklistSkillLive = McpServer.skill({
  uri: "skill://stack-effect/workshop-checklist/SKILL.md",
  files: {
    "SKILL.md": `---
name: workshop-checklist
description: Prepare a materials checklist when someone is planning a group workshop.
---

Ask for the number of groups and the materials each group needs.
For each item, multiply the quantity per group by the number of groups.
List each item with its quantity per group and total quantity to pack.
List shared supplies separately so they are counted once.
`,
  },
});
