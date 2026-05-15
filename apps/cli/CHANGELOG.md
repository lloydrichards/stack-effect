# stack-effect

## 0.4.0

### Minor Changes

- [#120](https://github.com/lloydrichards/stack-effect/pull/120) [`8cb7e00`](https://github.com/lloydrichards/stack-effect/commit/8cb7e00c4d3405e5103b6914ae2fac73aad21e3e) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add contextual next-steps output, closes [#107](https://github.com/lloydrichards/stack-effect/issues/107)

- [#118](https://github.com/lloydrichards/stack-effect/pull/118) [`17a665e`](https://github.com/lloydrichards/stack-effect/commit/17a665ee3a231fb8e25189563c4c3716a91b471d) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add progressive disclosure of scripts to be run for opt out, closes [#103](https://github.com/lloydrichards/stack-effect/issues/103)

- [#121](https://github.com/lloydrichards/stack-effect/pull/121) [`6227123`](https://github.com/lloydrichards/stack-effect/commit/62271234bda993285cdc299ac2e5e915d0f4dae3) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add Layout and Panel helpers for responsive composition

## 0.3.0

### Minor Changes

- [#116](https://github.com/lloydrichards/stack-effect/pull/116) [`98ad4f6`](https://github.com/lloydrichards/stack-effect/commit/98ad4f625e537486c42f7a8eab35b424657bb5cf) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add git init module and flags, closes [#106](https://github.com/lloydrichards/stack-effect/issues/106)

- [#116](https://github.com/lloydrichards/stack-effect/pull/116) [`4ad8be8`](https://github.com/lloydrichards/stack-effect/commit/4ad8be824cf72da690e111d248e2d9ab11801733) Thanks [@lloydrichards](https://github.com/lloydrichards)! - init now creates a subdirectory from the project name

  The 'init' command uses the positional name to create and write into a subdirectory, and '.' initializes in the current directory using the folder name as the project name:

  ```bash
      # Create a new project in ./my-app
    stack-effect init my-app --yes

    # Initialize in the current directory, deriving name from folder
    cd my-app && stack-effect init . --yes

    # Create in a specific parent directory
    stack-effect init my-app --yes --root /tmp
  ```

- [#115](https://github.com/lloydrichards/stack-effect/pull/115) [`aeecb7e`](https://github.com/lloydrichards/stack-effect/commit/aeecb7ea97fa647c50382f559f3ab91de9a2c56b) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add oxlint (linter) and dprint (formatter) modules

### Patch Changes

- [#112](https://github.com/lloydrichards/stack-effect/pull/112) [`27fc011`](https://github.com/lloydrichards/stack-effect/commit/27fc0116fbc388f7fcbaa0b01b1444cc01c10959) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add a KeyBinding abstraction to ensure input processing and hints align

- [#113](https://github.com/lloydrichards/stack-effect/pull/113) [`35c5a64`](https://github.com/lloydrichards/stack-effect/commit/35c5a64799e2509a27b094e2935fb240a5cad531) Thanks [@lloydrichards](https://github.com/lloydrichards)! - append args to call or array literal

- [#113](https://github.com/lloydrichards/stack-effect/pull/113) [`23b5229`](https://github.com/lloydrichards/stack-effect/commit/23b522960e82b962b8b416aed84531de7f02f11a) Thanks [@lloydrichards](https://github.com/lloydrichards)! - preserve existing file contents on modify

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
