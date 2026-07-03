# Catalog ID Naming Guidelines

> Human-facing guidelines for naming catalog target and module IDs. These rules
> define the intent behind the semantic structure without treating IDs as a
> machine-parsed grammar.

## Why This Exists

Catalog IDs appear in selections, examples, tests, issues, and reviews. A good
ID helps someone understand where a capability belongs, what family it is part
of, and how it relates to nearby modules.

Treat each ID like a short semantic path in kebab-case:

```text
<owner>-<neighborhood>-<capability-or-role>[-<variant-or-provider>]
```

Use only the words needed to make the name clear. Code should not rely on
splitting the ID into formal parts.

## Rule 1: Lead With The Owner

Module IDs start with the architectural owner or catalog layer so they sort and
scan predictably.

| Prefix      | Use For                                               |
| ----------- | ----------------------------------------------------- |
| `workspace` | root setup and developer-environment tooling          |
| `config`    | shared configuration                                  |
| `domain`    | canonical API, schema, RPC, or domain contracts       |
| `server`    | server application capabilities                       |
| `client`    | client application capabilities                       |
| `package`   | reusable non-domain package capabilities              |
| `cli`       | command-line application capabilities                 |

`domain` is a first-class owner even when domain code is generated into a
package target. Architectural meaning matters more than physical placement.

Examples:

```text
domain-chat-contracts
server-chat-rpc
client-react-chat
package-ai-chat-service
cli-command-chat-ask
```

## Rule 2: Name The Human Concept

IDs should describe what a person is choosing, not every implementation detail
used to deliver it.

Prefer:

```text
server-chat-rpc
client-react-chat
workspace-quality-biome
```

Avoid:

```text
server-chat-effect-rpc-layer
client-react-chat-generated-ui
workspace-quality-biome-json-config
```

Implementation details belong in catalog metadata, generated files, or module
descriptions unless they are the thing the user is actually selecting.

## Rule 3: Keep Target IDs Architectural

Target IDs describe the architectural destination. Do not include runtime,
package manager, transport, database, or build-tool choices.

Use target IDs like:

```text
workspace
client-react
client-foldkit
server
cli
package
```

Avoid target IDs like:

```text
cli-bun
server-http
client-react-vite
package-sqlite
```

`workspace` is the catalog target identity for root project setup. `init` is
the CLI action that creates a project, not the target identity.

## Rule 4: Align Related Families

Modules that form a stack across domain, server, and client targets should
share a visible family phrase. This makes dependencies, implications, and
selection lists easier to understand.

Examples:

```text
domain-rpc-contracts
server-http-rpc
client-react-http-rpc
client-foldkit-http-rpc
```

```text
domain-ws-contracts
server-ws-presence
client-react-ws-presence
client-foldkit-ws-presence
```

## Rule 5: Keep Policy And Generated Output Out Of IDs

IDs are selection handles, not policy records or generated paths.

Do not encode whether a module is required, default, optional, implied,
deprecated, exclusive, or compatible with another module. Those relationships
belong to catalog metadata.

Do not use catalog IDs to rename generated package names, paths, filenames, or
import specifiers. Generated output should follow the architecture of the
generated app or package, not the catalog taxonomy.

## Rule 6: Use Shared Vocabulary Intentionally

Use consistent role and neighborhood words so future IDs feel related to the
existing catalog.

Common role words:

| Role        | Use For                                      |
| ----------- | -------------------------------------------- |
| `contracts` | shared API, schema, RPC, or domain boundary  |
| `service`   | reusable shared implementation service       |
| `runtime`   | execution behavior behind a facade           |
| `command`   | user-facing CLI command                      |
| `driver`    | lower-level CLI integration or adapter       |
| `toolkit`   | collection of AI/tool helper capabilities    |
| `core`      | base package capability                      |

Common context words:

| Context   | Use For                                                |
| --------- | ------------------------------------------------------ |
| `devenv`  | developer environment setup, including Git and shells  |
| `quality` | linting and formatting tools                           |
| `test`    | test tooling                                           |
| `http`    | HTTP transport or API context                          |
| `rpc`     | RPC protocol or contract context                       |
| `ws`      | WebSocket transport context                            |

Put providers late when they are implementation choices:

```text
package-db-sqlite
config-typescript-vite
workspace-devenv-nix-flake
```

Let a provider act as the capability when users recognize it that way:

```text
workspace-devenv-git
```

Keep transport visible when it explains compatibility:

```text
server-http-rpc
client-react-http-rpc
server-ws-presence
client-react-ws-presence
```

Use `quality` for linting and formatting tools, and keep tests separate:

```text
workspace-quality-biome
workspace-quality-dprint
workspace-quality-oxlint
workspace-test-vitest
```

Add new role or context words deliberately. Prefer an existing word when it
fits.

## Naming Checklist

When adding or renaming an ID, ask:

1. **Owner**: What owner should this sort under?
2. **Concept**: What would a user or maintainer naturally call this capability?
3. **Target**: Is this a target name, and if so, is it architectural rather than configurational?
4. **Family**: Does it align with related modules across target families?
5. **Boundary**: Is policy or generated output leaking into the name?
6. **Vocabulary**: Does it reuse existing role/context words before inventing new ones?
