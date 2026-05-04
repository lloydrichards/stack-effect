# PRD: Composition Operations for Plan Outcomes

## Problem Statement

As a scaffold user, I can plan and apply file changes, but certain files require compositional merging rather than full replacement. When adding a module that contributes a Layer to a runtime composition point, the current system cannot append to an existing `Layer.mergeAll(...)` call. Instead, it must either replace the entire file (losing existing layers) or surface a conflict requiring manual intervention.

The current `RequiredStructure` handles JSON-based composition (package.json exports, dependencies, scripts) and simple barrel re-exports via regex parsing. However, TypeScript composition points like `Layer.mergeAll(...)`, `Toolkit.merge(...)`, or router definitions require AST-aware manipulation that the current system cannot perform.

From the user perspective, this creates friction: modules that should compose cleanly into existing runtime layers instead generate conflicts or require manual code editing after scaffold execution.

## Solution

Replace `RequiredStructure` with a polymorphic `CompositionOperations` array that supports both JSON manipulation and TypeScript AST manipulation. Consolidate the three outcome types (`complete`, `partial`, `composed`) into two: `complete` (static file) and `composed` (operations applied to seed or existing content).

- `CompositionOperations` is an array of tagged operations that can target JSON files or TypeScript files.
- JSON operations handle package.json fields (exports, dependencies, scripts).
- TypeScript operations handle imports, re-exports, and function call argument appending via ts-morph.
- Modules declare composition targets by convention: file path, target variable name, and function name.
- When a composition target cannot be found, surface a hard conflict rather than guessing.
- Idempotent operations (import/export/argument already exists) skip silently.

This gives users seamless composition: adding a module that provides `AuthLayer` automatically appends it to the existing `Layer.mergeAll(AppLayers, ...)` call without conflicts.

## User Stories

1. As a CLI user, I want modules to compose into existing Layer definitions, so that I do not need to manually edit runtime files after scaffolding.
2. As a CLI user, I want modules to add imports automatically when composing layers, so that the generated code is immediately valid.
3. As a CLI user, I want barrel file re-exports to be added via AST, so that complex export patterns are handled correctly.
4. As a CLI user, I want package.json dependencies to merge cleanly, so that adding modules does not overwrite existing dependencies.
5. As a CLI user, I want a clear conflict when composition targets are missing, so that I know to add the composition point manually.
6. As a CLI user, I want idempotent composition, so that re-running scaffold with the same modules does not duplicate imports or layer references.
7. As a CLI user, I want composition to work with `Toolkit.merge()` the same way it works with `Layer.mergeAll()`, so that future composition patterns are supported.
8. As a scaffold maintainer, I want one outcome type for all composition needs, so that the planning model is simpler.
9. As a scaffold maintainer, I want operations to be extensible via tagged unions, so that new operation types can be added without schema changes.
10. As a scaffold maintainer, I want one file per outcome, so that conflict detection and classification remain per-file.
11. As a scaffold maintainer, I want convention-based composition targeting, so that generated code has no magic comments or markers.
12. As a scaffold maintainer, I want modules to declare their composition targets in catalog metadata, so that the system knows where to insert.
13. As a scaffold maintainer, I want ts-morph for TypeScript manipulation, so that AST operations are reliable across syntax variations.
14. As a scaffold maintainer, I want JSON manipulation for package.json, so that structured data uses the appropriate tooling.
15. As a scaffold maintainer, I want composition failures to surface as conflicts, so that users have clear resolution paths.
16. As a scaffold maintainer, I want the Apply phase to dispatch operations by type, so that JSON and TypeScript handlers remain separate.
17. As a catalog author, I want to specify the target variable name for layer composition, so that the AST knows where to append.
18. As a catalog author, I want to specify the function name for call appending, so that `Layer.mergeAll` and `Toolkit.merge` use the same mechanism.
19. As a catalog author, I want modules to contribute multiple outcomes when composing into multiple files, so that cross-file composition is explicit.
20. As a tester, I want to test composition operations through filesystem outcomes, so that tests validate real behavior.
21. As a tester, I want fixtures for each operation type, so that JSON and TypeScript paths are both covered.
22. As a tester, I want conflict scenarios for missing composition targets, so that error handling is validated.
23. As a tester, I want idempotency tests, so that duplicate operations are confirmed to skip silently.
24. As a future contributor, I want the operation schema to be self-documenting, so that new operation types follow established patterns.
25. As a future contributor, I want composition logic encapsulated in deep modules, so that adding new operations does not require orchestration changes.

## Implementation Decisions

- Replace `RequiredStructure` with `CompositionOperations`, a `Schema.Array` of tagged operation unions.
- Consolidate outcome types: remove `partial`, keep `complete` and `composed`.
- The `composed` outcome has `path`, `classification`, optional `seedContents`, and `operations`.
- If `seedContents` is provided, use it as the base file; otherwise, use existing file contents from the repository.
- One outcome targets one file; modules contribute multiple outcomes for multi-file composition.
- Operation tags for JSON files:
  - `json-pkg-exports`: merge entries into package.json exports field
  - `json-pkg-deps`: merge entries into package.json dependencies or devDependencies
  - `json-pkg-scripts`: merge entries into package.json scripts field
- Operation tags for TypeScript files:
  - `ts-add-import`: add import statement with named imports, default import, or type-only
  - `ts-add-reexport`: add re-export statement (star or named exports)
  - `ts-append-call-arg`: append argument to a function call assigned to a specific variable
- For `ts-append-call-arg`, target by variable name and function name (e.g., `AppLayers` and `Layer.mergeAll`).
- If the target variable or function call is not found, surface a `compositionTargetNotFound` conflict.
- Idempotent behavior: if an import, re-export, or call argument already exists, skip silently without conflict.
- Add ts-morph as a dependency for TypeScript AST manipulation.
- Create a `CompositionEngine` service that dispatches operations to JSON or TypeScript handlers.
- JSON handler uses existing JSON parse/stringify approach.
- TypeScript handler uses ts-morph for AST manipulation.
- Extend conflict types to include `compositionTargetNotFound` with path, function name, and variable name.
- Module definitions in catalog declare `composesInto` metadata specifying file path, target variable, and function name.

## Testing Decisions

- Good tests assert external behavior: filesystem state after apply, conflict detection, idempotency.
- Good tests do not assert ts-morph internals or intermediate AST structures.
- Test JSON operations (`json-pkg-exports`, `json-pkg-deps`, `json-pkg-scripts`) with merge scenarios and conflict detection.
- Test TypeScript operations (`ts-add-import`, `ts-add-reexport`, `ts-append-call-arg`) with representative Layer composition scenarios.
- Test `compositionTargetNotFound` conflict when target variable or function is missing.
- Test idempotency: applying the same operations twice produces identical output without errors.
- Test multi-outcome scenarios where one module contributes to multiple files.
- Prior art: existing tests for `StructuralMerger`, barrel export parsing, and package.json merge behavior.
- Integration tests should start from real `Blueprint` and verify end-to-end composition through `Plan` and `Apply`.

## Out of Scope

- Config file composition (vite.config.ts, tsconfig.json) beyond package.json and TypeScript source files.
- Three-way merge tooling or interactive conflict resolution.
- Automatic creation of composition points when they do not exist.
- Refactoring existing code to use composition points.
- Version conflict resolution for dependencies (handled as conflict, not auto-resolved).
- Parallel file writes or transactional rollback.
- UI/UX design for composition conflict resolution flows.

## Further Notes

- This PRD extends the Apply execution model to handle AST-based composition alongside existing JSON merge behavior.
- The design follows the established pattern of deep modules with stable interfaces.
- Domain language aligns with `CONTEXT.md`: `Composed File Outcome` is now the canonical term for outcomes with operations.
- The `Toolkit.merge()` pattern can reuse `ts-append-call-arg` with different function name, demonstrating extensibility.
- Future operation types (e.g., `ts-append-array-element` for config plugin arrays) can be added without schema restructuring.
