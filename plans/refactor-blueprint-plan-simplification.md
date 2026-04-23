# Refactoring Plan: Simplify Blueprint & Plan

## Goal

Remove the cause/warning provenance system from Blueprint and Plan. Reshape Blueprint into a proper directed graph. Let Plan focus on file changes (PlanChangeset) and conflict detection against RepoSnapshot.

## Current Complexity

| Concern | Lines | Files |
|---|---|---|
| Cause types + conversion | ~850 | Blueprint.ts, Plan.ts, Order.ts, BlueprintService.ts, PlanService.ts |
| Warning types + builders | ~280 | Blueprint.ts, Plan.ts, Order.ts, BlueprintService.ts, PlanService.ts |
| **Total removable** | **~1130** | |

## Before / After Schemas

### Blueprint

**Before:**
```typescript
Blueprint {
  nodes: Array<ResolvedTarget>          // each has status, causes, targetModules w/ causes
  edges: Array<BlueprintDependencyEdge>
  modules: Array<ResolvedRepoModule>    // each has status, causes
  warnings: Array<BlueprintWarning>
}
```

**After:**
```typescript
Blueprint {
  nodes: Array<BlueprintNode>           // targets, target-modules, repo-modules as graph nodes
  edges: Array<BlueprintEdge>           // directed dependency edges
  roots: Array<string>                  // node IDs from Selection (user-selected)
}
```

Key changes:
- **Remove** `BlueprintCause`, `BlueprintStatus`, `BlueprintWarning`
- **Remove** `causes` and `status` from `ResolvedTarget`, `ResolvedTargetModule`, `ResolvedRepoModule`
- Selected vs implied is derived: roots = selected, everything else = implied (reachable from roots)
- Redundant selection is derivable: a root that is also reachable from another root

**New `BlueprintNode`:**
```typescript
BlueprintNode = Union(
  TaggedStruct("target", {
    id: NonEmptyString,
    identity: TargetIdentity,
    targetModules: Array(TargetModuleId),
    composition: optional(TargetComposition),
  }),
  TaggedStruct("target-module", {
    id: NonEmptyString,           // "targetId/moduleId"
    targetId: NonEmptyString,
    moduleId: TargetModuleId,
  }),
  TaggedStruct("repo-module", {
    id: RepoModuleId,
  }),
)
```

**New `BlueprintEdge`:**
```typescript
BlueprintEdge = Struct({
  id: NonEmptyString,
  from: NonEmptyString,           // node ID
  to: NonEmptyString,             // node ID
  reason: BlueprintEdgeReason,    // kept as-is
})
```

### Plan

**Before:**
```typescript
Plan {
  entries: Array<PlanEntry>             // each has causes
  tree: PlanTreeDirectoryNode           // each node has causes
  mergeRequirements: Array<MergeRequirement>  // each has causes
  warnings: Array<PlanWarning>
}
```

**After:**
```typescript
Plan {
  entries: Array<PlanEntry>             // no causes
  tree: PlanTreeDirectoryNode           // no causes
  conflicts: Array<PlanConflict>        // replaces mergeRequirements + warnings
}
```

Key changes:
- **Remove** `PlanCause` (all 5 variants)
- **Remove** `PlanWarning` (both variants)
- **Remove** `causes` from `PlanEntry`, `PlanFileEntry`, `PlanDirectoryEntry`, `PlanTreeFileNode`, `PlanTreeDirectoryNode`
- **Remove** `causes` from `MergeRequirement`
- **Rename** `MergeRequirement` → `PlanConflict` and remove causes
- **Remove** all cause conversion functions: `toPlanTargetCauses`, `toPlanTargetModuleCauses`, `toPlanRepoModuleCauses`, `toPlanTargetCompositionCauses`, `mergePlanCauses`, `isBlueprintCauseSelected`

**New `PlanConflict`:**
```typescript
PlanConflict = Union(
  TaggedStruct("packageJsonExports", {
    path: String,
    exportKey: String,
  }),
  TaggedStruct("packageJsonDependencies", {
    path: String,
    section: String,
    dependencyName: String,
  }),
  TaggedStruct("packageJsonScripts", {
    path: String,
    scriptName: String,
  }),
  TaggedStruct("barrelExport", {
    path: String,
    exportPath: String,
  }),
  TaggedStruct("tsconfig", {
    path: String,
  }),
  TaggedStruct("authoritativeFile", {
    path: String,
  }),
)
```

### PlanChangeset (internal to PlanService)

**Before:**
```typescript
PlanChangesetPath {
  path: string
  causes: NonEmptyArray<PlanCause>
  authoritativeContents: string | undefined
  packageJsonExports: Array<ProjectedPackageJsonExport>   // each has causes
  packageJsonDependencies: Array<ProjectedPackageJsonDependency>  // each has causes
  packageJsonScripts: Array<ProjectedPackageJsonScript>   // each has causes
  barrelExports: Array<ProjectedBarrelExport>   // each has causes
  tsconfig: ProjectedTsconfig | undefined       // has causes
}
```

**After:**
```typescript
PlanChangesetPath {
  path: string
  authoritativeContents: string | undefined
  packageJsonExports: Array<{ exportKey: string, exportValue: string }>
  packageJsonDependencies: Array<{ section: string, dependencyName: string, dependencyValue: string }>
  packageJsonScripts: Array<{ scriptName: string, scriptValue: string }>
  barrelExports: Array<{ exportPath: string }>
  tsconfig: { contents: string } | undefined
}
```

## Phased Execution

### Phase 1: Remove causes from Plan domain (packages/domain/src/Plan.ts)

1. Delete `PlanCause` schema and type
2. Remove `causes` field from: `PlanFileEntry`, `PlanDirectoryEntry`, `PlanTreeFileNode`, `PlanTreeDirectoryNode`, `MergeRequirement` (all 6 variants)
3. Delete conversion functions: `toPlanTargetCauses`, `toPlanTargetModuleCauses`, `toPlanRepoModuleCauses`, `toPlanTargetCompositionCauses`, `mergePlanCauses`, `isBlueprintCauseSelected`
4. Delete cause sorting: `sortPlanCauses`, `sortMergeRequirement` (cause part)
5. Rename `PlanWarning` → remove, replace `mergeRequirements` + `warnings` with `conflicts: Array<PlanConflict>`
6. Update `prettyPrint()` and `toSorted()`
7. Update `Plan.test.ts`

### Phase 2: Remove causes/warnings from Blueprint domain (packages/domain/src/Blueprint.ts)

1. Delete `BlueprintCause`, `BlueprintStatus`, `BlueprintWarning` schemas
2. Remove `causes` and `status` from `ResolvedTarget`, `ResolvedTargetModule`, `ResolvedRepoModule`
3. Add `roots: Array<string>` to `Blueprint`
4. Flatten node types into `BlueprintNode` union (target, target-module, repo-module)
5. Simplify `BlueprintDependencyEdge` to `BlueprintEdge` (use node ID strings instead of `BlueprintNodeReference`)
6. Remove `BlueprintNodeReference` (no longer needed — edges use string IDs)
7. Update `toSorted()`, `prettyPrint()`, helper methods
8. Update `Blueprint.test.ts`

### Phase 3: Simplify Order.ts (packages/domain/src/Order.ts)

1. Delete `blueprintCauseOrd`, `blueprintWarningOrd`, `planCauseOrd`, `planWarningOrd`, `toPlanCauseKey`
2. Delete `toBlueprintCauseKey`, `toBlueprintNodeReferenceKey` (if BlueprintNodeReference removed)
3. Simplify `mergeRequirementOrd` (no causes to sort)

### Phase 4: Simplify BlueprintService (packages/scaffold/src/service/BlueprintService.ts)

1. Remove `MutableTargetState.causes`, `MutableTargetModuleState.causes`, `MutableRepoModuleState.causes`
2. Remove `appendCause`, `toSelectionCause`, `toDependencyCause`, `toCauseKey`
3. Remove cause threading from `ensureTarget`, `ensureRepoModule`, `ensureTargetModule`
4. Remove `buildWarnings`, `toRedundantSelectionWarning`
5. Populate `roots` from selection input
6. Build `BlueprintNode[]` instead of `ResolvedTarget[]`
7. Keep `buildGraph()` — it already uses `Graph.directed()` — but return the graph as the Blueprint
8. Update `BlueprintService.test.ts` — remove all cause/warning assertions, add root assertions

### Phase 5: Simplify PlanService (packages/scaffold/src/service/PlanService.ts)

1. Remove `causes` from all `Projected*` types
2. Remove all `appendProjected*` cause-merging logic (simplify to plain accumulation)
3. Remove cause threading from `collectProjectedPlanPaths`, `collectProjectedContents`, etc.
4. Remove `getOrCreatePlanChangesetPath` cause merging
5. Remove `toRootBootstrapCauses`, `getRepoOnlyRootBootstrapCauses` cause logic
6. Replace `mergeRequirements` + `warnings` output with `conflicts`
7. Remove all `create*Warning` and `create*MergeRequirement` cause parameters
8. Update `PlanService.test.ts` — remove cause assertions from entries/directories

## Estimated Impact

| Metric | Before | After | Reduction |
|---|---|---|---|
| Blueprint.ts | 381 lines | ~200 lines | ~47% |
| Plan.ts | 491 lines | ~250 lines | ~49% |
| Order.ts | 152 lines | ~80 lines | ~47% |
| BlueprintService.ts | 704 lines | ~400 lines | ~43% |
| PlanService.ts | 1628 lines | ~900 lines | ~45% |
| **Total** | **3356 lines** | **~1830 lines** | **~45%** |

## Verification

After each phase, run:
```bash
bun test --filter=domain
bun test --filter=scaffold
bun lint
```

## What We Keep

- `BlueprintEdgeReason` — useful for understanding dependency relationships
- `PlanEntryClassification` — create/modify/unchanged/needsMergeStrategy
- `RepoSnapshot` / `RepoSnapshotPath` — filesystem state
- `PlanConflict` (née `MergeRequirement`) — conflict detection, minus causes
- `TargetComposition` — package entrypoint composition
- `BlueprintFailure`, `CatalogNotFound`, `PlanFailure` — error types
- `prettyPrint()` — adapted to show graph structure without cause/warning noise

## What We Remove

- `BlueprintCause` (2 variants) + `PlanCause` (5 variants) + all conversion functions
- `BlueprintWarning` (1 variant) + `PlanWarning` (2 variants)
- `BlueprintStatus` ("selected" | "implied")
- `BlueprintNodeReference` (replaced by string node IDs)
- ~1130 lines of cause/warning threading, sorting, merging, and conversion code
