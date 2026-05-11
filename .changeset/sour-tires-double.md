---
"stack-effect": minor
---

Improve consistency and usability of TUI prompt components

- Standardize submitted state across all prompts: `✔ <bold message> <cyan value>`
- New `MultiSelect` component with checkbox UI, per-row descriptions on highlight, green selected rows, and `a` to toggle all
- Refactor `Confirm` to support scrollable children viewport sized to terminal height, replacing the alternate screen buffer approach that clipped on small terminals
