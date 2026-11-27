---
"stack-effect": minor
"@stack-effect/docs": minor
---

Explicit app target names now determine the folder under apps/. Use a blank target name to keep the catalog default folder.

`--target server/api:server-http-api` now generates `apps/api`. To add modules to an existing `apps/server-api` app, use `--target server/:server-http-api`. If a later add reports a conflict with an existing named app, include that app's target in the same command.

For a previously generated custom app, move it to the new folder and update any workspace paths, imports, or scripts that reference the old folder before running `add`. The workspace package name stays the same.
