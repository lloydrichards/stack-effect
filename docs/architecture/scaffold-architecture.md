# Scaffold Package Architecture

> Internal architecture documentation for `@repo/scaffold`. For domain term
> definitions, see [DOMAIN_LEXICON.md](../DOMAIN_LEXICON.md).

## Overview

The scaffold package provides **runtime orchestration services** that transform
user selections into repository changes. It implements the core pipeline:

`Selection -> Blueprint -> Plan -> Apply -> ApplyResult -> FinalizeReport`

**Package**: `@repo/scaffold`  
**Role**: Executes the scaffold pipeline from resolved intent to filesystem
changes

## Package Structure

```bash
packages/scaffold/
└── src/
    ├── index.ts                    # Public exports
    └── service/
        ├── ScaffolFormatter.ts     # Display formatting
        ├── blueprint/
        │   └── BlueprintService.ts # Selection -> Blueprint
        ├── plan/
        │   ├── PlanService.ts      # Blueprint -> Plan
        │   ├── ContributionResolver.ts
        │   ├── PlanAssessor.ts
        │   └── RepoSnapshotService.ts
        ├── apply/
        │   ├── ApplyService.ts     # Plan -> ApplyResult
        │   ├── StructuralMerger.ts
        │   └── WriteEngine.ts
        └── finalize/
            └── FinalizeService.ts  # Script execution
```

## Services Overview

| Service              | Boundary | Purpose                                   |
| -------------------- | -------- | ----------------------------------------- |
| BlueprintService     | Public   | Selection validation + dependency closure |
| PlanService          | Public   | Blueprint to repo-aware plan              |
| ContributionResolver | Public   | Token substitution for contributions      |
| PlanAssessor         | Public   | Path classification and conflicts         |
| ApplyService         | Public   | Plan execution with decisions             |
| FinalizeService      | Public   | Post-apply script execution               |
| ScaffoldFormatter    | Public   | Blueprint/Plan display formatting         |
| RepoSnapshotService  | Internal | Filesystem state loading                  |
| StructuralMerger     | Internal | package.json/barrel file merging          |
| WriteEngine          | Internal | Atomic file writes                        |

## Pipeline Sequence

```mermaid
sequenceDiagram
    participant CLI
    participant Blueprint as BlueprintService
    participant Plan as PlanService
    participant Apply as ApplyService
    participant Finalize as FinalizeService

    CLI->>Blueprint: resolve(selection)
    Blueprint->>Blueprint: validate duplicates
    Blueprint->>Blueprint: check module compatibility
    Blueprint->>Blueprint: resolve dependencies
    Blueprint-->>CLI: Blueprint

    CLI->>Plan: build(blueprint, repoRoot, config)
    Plan->>Plan: resolve contributions
    Plan->>Plan: load repo snapshot
    Plan->>Plan: assess paths
    Plan-->>CLI: Plan

    CLI->>CLI: resolve conflicts (user decisions)

    CLI->>Apply: apply({plan, decisions}, repoRoot)
    Apply->>Apply: materialize outcomes
    Apply->>Apply: merge structural files
    Apply->>Apply: write files atomically
    Apply-->>CLI: ApplyResult

    CLI->>Finalize: run(blueprint, config)
    Finalize->>Finalize: collect scripts
    Finalize->>Finalize: execute in order
    Finalize-->>CLI: FinalizeReport
```

## Service Composition

```mermaid
flowchart TB
    subgraph Public Boundary
        BS[BlueprintService]
        PS[PlanService]
        AS[ApplyService]
        FS[FinalizeService]
    end

    subgraph Internal Dependencies
        CR[ContributionResolver]
        PA[PlanAssessor]
        RSS[RepoSnapshotService]
        SM[StructuralMerger]
        WE[WriteEngine]
    end

    subgraph External
        CS[CatalogService]
        FileSystem[(FileSystem)]
    end

    BS --> CS
    FS --> CS
    CR --> CS
    PS --> CR
    PS --> PA
    PS --> RSS
    RSS <--> FileSystem
    AS --> SM
    AS --> WE
    SM --> FileSystem
    WE --> FileSystem
```

## BlueprintService

**Input**: `Selection` (user intent)  
**Output**: `Blueprint` (dependency closure graph)

### Internal Process

1. **Validation Phase**
   - Check for duplicate target selections
   - Check for duplicate module selections per target
   - Validate module-target compatibility via CatalogService

2. **Resolution Phase**
   - Uses `ResolutionState` (mutable Ref with HashMaps)
   - `ensureTarget`: Lazily creates target nodes
   - `ensureAttachedModule`: Creates module nodes, resolves dependencies
   - Creates edges: `owns-module`, `required-target`, `required-module`

### Blueprint Structure

Nodes:

- `BlueprintTargetNode`: `{_tag: "target", id: TargetKey, identity}`
- `BlueprintAttachedModuleNode`: `{_tag: "attached-module", id, targetId, moduleId}`

Edges:

- `owns-module`: Target owns an attached module
- `required-target`: Module requires a target to exist
- `required-module`: Module requires another module

## PlanService

**Input**: `Blueprint`, `repoRoot`, `StackConfig`  
**Output**: `Plan` (repo-aware outcomes + conflicts)

### Internal Process

```mermaid
flowchart LR
    A[Blueprint] --> B[ContributionResolver]
    B --> C[NormalizedContributions]
    C --> D[PlanningIntentPaths]
    D --> E[RepoSnapshotService]
    E --> F[RepoSnapshot]
    F --> G[PlanAssessor]
    G --> H[Plan]
```

1. **Contribution Resolution** (ContributionResolver)
   - Look up target/module contributions from catalog
   - Resolve tokens ({{targetPath}}, {{projectName}}, etc.)
   - Return `NormalizedContributions`

2. **Intent Compilation**
   - Convert contributions to `PlanningIntentPath` entries
   - Group by file path with all contribution data

3. **Snapshot Loading** (RepoSnapshotService)
   - Load current filesystem state for relevant paths
   - Return `RepoSnapshot` with missing/directory/file entries

4. **Plan Projection** (PlanAssessor)
   - Validate ancestor directories
   - Classify each path: create/modify/unchanged/conflict
   - Detect conflicts in structural files

### PlanningIntentPath

Internal representation of a planned file:

| Field           | Purpose                               |
| --------------- | ------------------------------------- |
| `path`          | Absolute file path                    |
| `contents`      | Full file contents (if authoritative) |
| `exports`       | package.json exports to add           |
| `dependencies`  | package.json dependencies to add      |
| `scripts`       | package.json scripts to add           |
| `barrelExports` | Re-export statements to add           |
| `tsconfig`      | tsconfig.json contents                |

### Plan Outcome Types

```mermaid
stateDiagram-v2
    [*] --> Assessing

    state Assessing {
        [*] --> CheckExists
        CheckExists --> Missing: file missing
        CheckExists --> Exists: file exists

        Missing --> Create: has contents
        Exists --> Compare: has contents

        Compare --> Unchanged: contents match
        Compare --> Modify: contents differ

        Exists --> CheckStructure: structural only
        CheckStructure --> Partial: no conflicts
        CheckStructure --> Conflict: has conflicts
    }

    Create --> CompleteOutcome
    Unchanged --> CompleteOutcome
    Modify --> CompleteOutcome
    Partial --> PartialOutcome
    Conflict --> ConflictOutcome
```

**Outcome Types**:

- `complete`: Full file contents known (create/modify/unchanged)
- `partial`: Structural requirements only (package.json merges)
- `composed`: Base file + structural additions

**Classifications**:

- `create`: File does not exist, will be created
- `modify`: File exists, contents differ
- `unchanged`: File exists, contents match
- `conflict`: Structural conflict detected

## ApplyService

**Input**: `Apply` (plan + decisions), `repoRoot`  
**Output**: `ApplyResult` (created/modified/skipped/failed)

### Internal Process

1. **Materialize Actions**
   - Convert Plan outcomes + decisions to actions
   - Skip unchanged files
   - Apply conflict decisions (override/skip)

2. **Structural Merging** (StructuralMerger)
   - Merge package.json exports/dependencies/scripts
   - Merge barrel export statements

3. **File Writing** (WriteEngine)
   - Atomic writes (temp file + rename)
   - Validate writeMode vs file existence
   - Create parent directories as needed

### Materialized Actions

| Action                | When Applied                         |
| --------------------- | ------------------------------------ |
| `skip`                | unchanged or decision=skip           |
| `write-authoritative` | complete outcome, create/modify      |
| `write-structural`    | partial outcome                      |
| `write-composed`      | composed outcome (base + structural) |

### WriteMode

| Mode       | Expects      | Behavior        |
| ---------- | ------------ | --------------- |
| `create`   | File missing | Fail if exists  |
| `modify`   | File exists  | Fail if missing |
| `override` | Either       | Always write    |

## FinalizeService

**Input**: `Blueprint`, `FinalizeConfig`  
**Output**: `FinalizeReport`

### Script Collection Order

1. Target finalize scripts (from catalog)
2. Module finalize scripts (topological order by dependencies)
3. Config-derived scripts:
   - `{pm} install` (always)
   - `{pm} run lint` (if lint: "biome")
   - `{pm} run format` (if format: "biome")

### FinalizeReport

| Field     | Type                                               |
| --------- | -------------------------------------------------- |
| `results` | Array of {label, command, workdir, status, error?} |

## ScaffoldFormatter

Formats Blueprint and Plan for CLI display.

**Blueprint Output**:

```bash
Blueprint:
- apps/server-api (server)
  └╌> apps/server-api#http-api-server
       ├─> packages/domain [required-target]
       └─> packages/domain#domain-api [required-module]
```

**Plan Output**:

```bash
Plan:
[+] create  [~] modify  [=] unchanged  [!] conflict
1 create  1 modify  1 unchanged  2 conflict
.
├── packages/domain/
│   └── src/
│       └── [+] Api.ts
└── [~] README.md
```

## Error Types

| Error              | Service        | Causes                                    |
| ------------------ | -------------- | ----------------------------------------- |
| `BlueprintFailure` | Blueprint      | Duplicate selections, unsupported modules |
| `CatalogNotFound`  | Blueprint/Plan | Missing target/module definitions         |
| `PlanFailure`      | Plan           | File blocking directory, invalid intent   |
| `ApplyFailure`     | Apply          | Invalid decisions, write failures         |

## Layer Composition

Services declare dependencies via Effect Layers:

```bash
BlueprintService.layer
  └── CatalogService.layer

PlanService.layer
  ├── ContributionResolver.layer
  ├── RepoSnapshotService.layer
  ├── PlanAssessor.layer
  └── CatalogService.layer

ApplyService.layer
  ├── WriteEngine.layer
  └── StructuralMerger.layer

FinalizeService.layer
  └── CatalogService.layer
```

## Invariants

- Blueprint is dependency closure only, no file contributions
- Plan is policy-free, no apply decisions
- Apply decisions required only for conflict classifications
- Missing or extra decisions make Apply invalid
- A module contributes only to its owning target
- Cross-target effects modeled via dependencies, not direct writes
- File writes are atomic (temp + rename pattern)
- Finalize scripts run in topological dependency order
