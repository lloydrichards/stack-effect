# stack-effect

## 0.2.0

### Minor Changes

- [#99](https://github.com/lloydrichards/stack-effect/pull/99) [`d76bf2d`](https://github.com/lloydrichards/stack-effect/commit/d76bf2df28071ff84e3ebd8317d082adce9c687b) Thanks [@lloydrichards](https://github.com/lloydrichards)! - Add CLI target module and file contributions

  - Add `hello-command` module to the CLI target with a hello-world subcommand
  - Wire module into the CLI entrypoint via `ts-call-arg` composition contribution
  - CLI target now supports incremental module additions:
    ```sh
    bunx stack-effect@latest add --target cli --modules hello-command
    ```

- [#98](https://github.com/lloydrichards/stack-effect/pull/98) [`d12bbc8`](https://github.com/lloydrichards/stack-effect/commit/d12bbc8d92fff766e8afce40a2a3b2f4b8e4f4f3) Thanks [@lloydrichards](https://github.com/lloydrichards)! - Improve consistency and usability of TUI prompt components

  - Standardize submitted state across all prompts: `✔ <bold message> <cyan value>`
  - New `MultiSelect` component with checkbox UI, per-row descriptions on highlight, green selected rows, and `a` to toggle all
  - Refactor `Confirm` to support scrollable children viewport sized to terminal height, replacing the alternate screen buffer approach that clipped on small terminals

## 0.1.1

### Patch Changes

- [#95](https://github.com/lloydrichards/stack-effect/pull/95) [`ee38545`](https://github.com/lloydrichards/stack-effect/commit/ee3854564a7df294b8dcf03c8431e75f759e616c) Thanks [@lloydrichards](https://github.com/lloydrichards)! - move runtime dependecies to devDep

## 0.1.0

### Minor Changes

- [#92](https://github.com/lloydrichards/stack-effect/pull/92) [`42968c4`](https://github.com/lloydrichards/stack-effect/commit/42968c4f37d95bbca9d6fa85e3c62db02c4be60a) Thanks [@lloydrichards](https://github.com/lloydrichards)! - setup repo for publishing npm package

### Patch Changes

- [#94](https://github.com/lloydrichards/stack-effect/pull/94) [`9ca99f2`](https://github.com/lloydrichards/stack-effect/commit/9ca99f2dba1232699ecec3bb7ef47ecc2ea1ab12) Thanks [@lloydrichards](https://github.com/lloydrichards)! - make the cli executable
