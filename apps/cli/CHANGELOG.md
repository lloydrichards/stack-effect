# stack-effect

## 0.9.0

### Minor Changes

- 1c363c1: add module capabilities for module validation
- cc243fc: add `db-sqlite` module
- 36ad3e1: Extract DevTools into its own module for each target
- 2022bfc: add `db-sql-postgres` module
- e8a2769: dry-run and plan previews show the equivalent `stack-effect create` command for the selected scaffold.

  For example, a preview can show `stack-effect create my-app --target server/api:server-http-api` so the same scaffold can be repeated non-interactively.

- bbfaa1a: add create command to one-shot create a scaffold in a green-field project

### Patch Changes

- 1a7ee05: bump effect in catalog to v4-beta.93
- 2de0386: `stack-effect add` ignores selected modules that are not supported by the edited target.
- 03b1258: empty or punctuation-only target names resolve to catalog defaults instead of generating punctuation-only target paths.
- 9dfd158: Refactor recipe target handling so `--target` works consistently across `create`, `add`, and catalog workspace commands.

  This also removes older command surface that was replaced by the unified recipe flow, including `stack-effect create --from ...` and the file-input `stack-effect plan -f ...` usage. Use explicit `--target <targetKind>/<targetName>:<moduleId>[,...]` inputs for non-interactive scaffolding and pipe structured plan input through stdin for `stack-effect plan`.

- d78a24d: dry-run previews skip conflicted planned paths instead of failing because conflict decisions are missing.
- ea7cc10: fix RPC chat stream lifetime by providing the client layer across the full stream
- 47868de: fix the Foldkit Vite plugin import to use the named `foldkit` export
- 6d4acb1: use the shadcn components for messages and markers for the ChatBox
- 8844b46: provide which env need to be added in the nextStep to the user

## 0.8.0

### Minor Changes

- 951e712: add `terminal-chat-command` modules which adds an interactive chat app in the cli app
- 91b5f69: add `chat-cli-driver` and `chat-ask-command` modules

### Patch Changes

- 3158d40: define a semantic guide for catalog IDs and align it across all current modules and targets.
- 0cf68fc: fix confirmation tui width when lots of modules added
- 48e3d5f: fix chat CLI scaffolding creating duplicate CLI apps

## 0.7.0

### Minor Changes

- 693ab31: add chat-managed-runtime module for managing multiple chat sessions
- f5f3ed2: add catalog workspace flow for working on catalog change

### Patch Changes

- 41729af: improve the agentic loop with a service and cleaner events mailbox
- ac4a390: simplify the chat interface and stream parts

## 0.6.0

### Minor Changes

- [#138](https://github.com/lloydrichards/stack-effect/pull/138) [`174784e`](https://github.com/lloydrichards/stack-effect/commit/174784eeb9eb373bb519150aa91ed594d1db2479) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add new Toolkits for the ai module

  - **DateTimeToolkit** <- provides functions for working with dates and times
  - **MathToolkit** <- provides functions for mathematical operations
  - **MemoryToolkit** <- provides functions for working with memory and data storage
  - **PlanToolkit** <- provides functions for creating and managing plans and tasks
  - **WebFetchToolkit** <- provides functions for making web requests and fetching data from the internet

- [#131](https://github.com/lloydrichards/stack-effect/pull/131) [`94b927d`](https://github.com/lloydrichards/stack-effect/commit/94b927daa9b6c15a0663ef9652117eb173ee4649) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add nix flake module for init devenv

- [#131](https://github.com/lloydrichards/stack-effect/pull/131) [`16231f0`](https://github.com/lloydrichards/stack-effect/commit/16231f0522ac4ecea7ffb768224891068cdd58e3) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add devcontainer module for init devenv

### Patch Changes

- [#138](https://github.com/lloydrichards/stack-effect/pull/138) [`7d3f2db`](https://github.com/lloydrichards/stack-effect/commit/7d3f2dbcd228ff450a40e75ddc6b36cad09003b4) Thanks [@lloydrichards](https://github.com/lloydrichards)! - fix strip cross-target module from autoselect

- [#135](https://github.com/lloydrichards/stack-effect/pull/135) [`f7bf08b`](https://github.com/lloydrichards/stack-effect/commit/f7bf08be8e2e67bcf2e478712bd0aa64400eae49) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add ModuleChild schema for nested module selection

- [#137](https://github.com/lloydrichards/stack-effect/pull/137) [`e5c249a`](https://github.com/lloydrichards/stack-effect/commit/e5c249a995490e6fe52ba5746a9ce34449b14a02) Thanks [@lloydrichards](https://github.com/lloydrichards)! - upgrade to effect@v4-beta.80 and use the new Crypto module

- [#135](https://github.com/lloydrichards/stack-effect/pull/135) [`35ea7e0`](https://github.com/lloydrichards/stack-effect/commit/35ea7e0fceeea60bead6680a32a089dc442f4b59) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add Think toolkit as default toolkit for chat service

## 0.5.0

### Minor Changes

- [#130](https://github.com/lloydrichards/stack-effect/pull/130) [`2228396`](https://github.com/lloydrichards/stack-effect/commit/22283964ec26cfb503aa4d88f5d67b3640d5abe0) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add `client-foldkit` target kind.

  Includes four feature modules:

  - `http-api-foldkit-client`
  - `http-rpc-foldkit-client`
  - `ws-presence-foldkit-client`
  - `chat-foldkit-client`

  also added new deterministic AST-based composition via new `ts-object-field` and `namespaceImport` contribution primitives.

- [#128](https://github.com/lloydrichards/stack-effect/pull/128) [`9959c69`](https://github.com/lloydrichards/stack-effect/commit/9959c69e3dd53d1a9ff2e22e22332abf9a1f2004) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add JSX slot injection system and upgrade client templates to shadcn components.

### Patch Changes

- [#127](https://github.com/lloydrichards/stack-effect/pull/127) [`1983994`](https://github.com/lloydrichards/stack-effect/commit/198399421bbd7966425a9918aead48882cf358ef) Thanks [@lloydrichards](https://github.com/lloydrichards)! - correct shadcn config filename and deduplicate finalize scripts

- [#129](https://github.com/lloydrichards/stack-effect/pull/129) [`4a3acc8`](https://github.com/lloydrichards/stack-effect/commit/4a3acc84f5a1573962d3f5f1394bd61c28c04bea) Thanks [@lloydrichards](https://github.com/lloydrichards)! - rename `client` target kind to `client-react` and prefix client module IDs with `react`

  - `http-api-client` becomes `http-api-react-client`
  - `http-rpc-client` becomes `http-rpc-react-client`
  - `ws-presence-client` becomes `ws-presence-react-client`

- [#125](https://github.com/lloydrichards/stack-effect/pull/125) [`6204bc1`](https://github.com/lloydrichards/stack-effect/commit/6204bc169ba45bc8beee080d9221f60bdd2d6a01) Thanks [@lloydrichards](https://github.com/lloydrichards)! - update cli version to use package version

## 0.4.0

### Minor Changes

- [#124](https://github.com/lloydrichards/stack-effect/pull/124) [`c5d0872`](https://github.com/lloydrichards/stack-effect/commit/c5d0872dcdaa00f974978d749ce7ceea8d004a57) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add `schema` command to serialize the catalog and plan input schema, closes [#109](https://github.com/lloydrichards/stack-effect/issues/109)

  Outputs a JSON object with the full catalog (targets, modules, dependencies, implications) and a JSON Schema for the `plan` command's stdin input. Designed for LLMs, CI pipelines, and external tooling to discover available scaffolding options programmatically:

  ```bash
    # Dump catalog and plan input schema
    stack-effect schema

    # Pipe into jq for inspection
    stack-effect schema | jq '.catalog.targets'
    stack-effect schema | jq '.planInput'
  ```

- [#120](https://github.com/lloydrichards/stack-effect/pull/120) [`8cb7e00`](https://github.com/lloydrichards/stack-effect/commit/8cb7e00c4d3405e5103b6914ae2fac73aad21e3e) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add contextual next-steps output, closes [#107](https://github.com/lloydrichards/stack-effect/issues/107)

- [#124](https://github.com/lloydrichards/stack-effect/pull/124) [`4d0ee6b`](https://github.com/lloydrichards/stack-effect/commit/4d0ee6be4927fad4695b6d5713372f5afbe6b57e) Thanks [@lloydrichards](https://github.com/lloydrichards)! - add `plan` command for non-interactive blueprint and plan generation, closes [#102](https://github.com/lloydrichards/stack-effect/issues/102)

  Reads a Selection + optional config from stdin, runs the Blueprint → Plan pipeline, and outputs structured JSON. Supports three output formats for different consumers:

  ```bash
    # Pipe a selection to get raw plan output
    echo '{"selection":{"targets":[{"kind":"server","name":"api"}]}}' | stack-effect plan --root ./my-app

    # Get an LLM-friendly format with resolved file contents
    echo '{"selection":{"targets":[...]}}' | stack-effect plan -f llm

    # Get a visual tree summary
    echo '{"selection":{"targets":[...]}}' | stack-effect plan -f tree
  ```

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
    bunx stack-effect@latest add --target cli/app:hello-command
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
