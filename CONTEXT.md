# Scaffold Planning

This context defines how scaffold selections are resolved into a dependency graph and then projected into concrete repository changes. It exists to keep the language around scaffold structure, dependencies, and generated outputs precise.

## Language

**Target**:
A concrete workspace in the repository with a stable identity and directory.
_Avoid_: Node, app, package unit

**Target Identity**:
A behavior-bearing domain value object that identifies a **Target** as `{ kind, name }`.
_Avoid_: Target ID, target path, plain DTO

**Target Path**:
The repo-relative workspace directory for a **Target**.
_Avoid_: Identity, key

**Target Key**:
A canonical string identifier for a **Target** used in graph edges and lookups; in this context it is the same value as the **Target Path**.
_Avoid_: Display name

**Blueprint Node ID**:
A canonical string identifier for a node in a **Blueprint**, representing either a **Target** or an **Attached Module**.
_Avoid_: Target key, target identity

**Module**:
A reusable capability type that may be attached to a compatible **Target**.
_Avoid_: Feature, plugin, target module instance

**Attached Module**:
The occurrence of a **Module** on a specific **Owning Target**.
_Avoid_: Module instance, target module, shared module node

**Supported On**:
A declarative compatibility rule describing which **Targets** a **Module** may be attached to.
_Avoid_: isSupported predicate, runtime compatibility check

**Required Target**:
A dependency that requires another **Target** to exist, without requiring a specific **Module** on it.
_Avoid_: Canonical target, implicit workspace dependency

**Required Module**:
A dependency that requires a specific **Module** on a specific **Target**.
_Avoid_: Feature dependency, target module dependency

**Init**:
A separate repository bootstrap process that prepares only the stable repo-wide substrate outside the **Blueprint** to **Plan** flow.
_Avoid_: Root target, repo module

**Blueprint**:
A resolved dependency-closure graph of **Targets** and **Attached Modules**, without preserving direct-selection provenance.
_Avoid_: Selection result, resolved plan, selection provenance, custom graph API

**Plan**:
A projection of a **Blueprint** onto the current repository state to describe canonical planned file outcomes and conflicts.
_Avoid_: Blueprint, changeset

**PlanService**:
The planning boundary that derives a **Plan** from a **Blueprint** and the current repository snapshot.
_Avoid_: Intent builder, comparator pipeline, staged planner API

**Apply**:
An execution intent that embeds a **Plan** and the user-provided **Apply Decisions** required to run apply.
_Avoid_: Apply request DTO, UI state, post-plan options

**Apply Service**:
The execution boundary that materializes a **Plan** into repository changes using **Apply Decisions**.
_Avoid_: Writer, patch runner, installer

**Apply Decision**:
A per-conflicted-path user policy for a `needsMergeStrategy` **Planned File Outcome**.
_Avoid_: Plan policy, merge engine mode

**Planned File Outcome**:
The canonical desired state and classification for one planned file path after the **Plan** normalizes contributions against the current repository snapshot.
_Avoid_: Entry, diff row, render node

**Authoritative File Outcome**:
A **Planned File Outcome** where the **Plan** knows the full desired file contents.
_Avoid_: Merge candidate, patch

**Structural Merge Outcome**:
A **Planned File Outcome** where the **Plan** knows the required structural result for a file without treating the whole file as authoritative.
_Avoid_: Free-form patch, generic diff

**Desired Contribution**:
The repository state that a **Target Contribution** or **Module Contribution** wants to exist, without encoding merge policy.
_Avoid_: Merge instruction, planner rule

**Contribution Token**:
An explicit placeholder like `{{targetDir}}` or `{{targetName}}` used to resolve a **Desired Contribution** against a specific **Target** context.
_Avoid_: Template function, dynamic generator

**Target Contribution**:
The base workspace scaffold produced by a **Target**.
_Avoid_: Base module, default feature

**Module Contribution**:
The capability-specific overlay produced by a **Module** on a **Target**.
_Avoid_: Patch, extension file

**Owning Target**:
The **Target** an **Attached Module** is attached to and allowed to contribute to directly.
_Avoid_: Host target, source target

## Relationships

- A **Blueprint** resolves the dependency closure introduced by selected **Targets** and **Modules**
- A **Blueprint** contains resolved graph structure, not normalized file contributions
- A **Blueprint** represents the resolved dependency closure only and does not preserve which nodes were directly selected
- Within a **Blueprint**, selected and implied **Targets** with the same identity collapse to the same node
- A **Module** may be attached to multiple **Targets** through distinct **Attached Modules**
- An **Attached Module** belongs to exactly one **Owning Target**
- A **Blueprint** represents ownership between a **Target** and its **Attached Modules** as real graph edges
- A **Blueprint** distinguishes ownership edges from dependency edges
- A **Blueprint** may contain both **Required Target** and **Required Module** edges between related nodes when both requirements are declared
- A **Blueprint** exposes both **Target** nodes and **Attached Module** nodes at its public boundary
- A **Blueprint Node ID** is not the same concept as a **Target Key**
- A **Target** node uses its **Target Key** as its **Blueprint Node ID**
- An **Attached Module** node uses a canonical `TargetKey#ModuleId` **Blueprint Node ID**
- In this context, **Target Key** and **Target Path** collapse to the same canonical string
- In this context, **Target Key** and **Target Path** remain separate domain concepts with separate operations even when they serialize to the same canonical string
- A **Blueprint** is simple graph data with minimal helpers, not a custom query API
- **BlueprintService** currently owns both selection validation and dependency-closure resolution
- A **Module** may depend on a **Required Target**, a **Required Module**, or both
- A **Module** is globally identified by its module ID and constrained by **Supported On** rules
- **Supported On** rules match either a target kind or an exact target identity
- **Required Target** and **Required Module** reference **Target Identity**; the canonical target path/key is derived later
- A **Plan** is derived from a **Blueprint** and the current repository snapshot
- A **Plan** is the canonical model of planned file outcomes and conflicts
- A **Plan** treats file paths as first-class planned outcomes
- A **Plan** contains one **Planned File Outcome** per planned file path
- Directories implied by planned file paths are derived structure, not planned outcomes
- Tree and directory views of a **Plan** are derived presentations, not core planning data
- A **Planned File Outcome** is either an **Authoritative File Outcome** or a **Structural Merge Outcome**
- A **Structural Merge Outcome** exposes required structure at the public boundary, not planner merge-strategy names
- `tsconfig.json` is treated as an **Authoritative File Outcome** in this context
- **PlanService** owns both desired-outcome resolution from a **Blueprint** and comparison against the current repository snapshot
- **PlanService** exposes a single public planning operation from **Blueprint** plus repo root to **Plan**
- A **Plan** does not contain **Apply Decisions**
- **Apply** embeds the **Plan** it executes
- **Apply Service** consumes an **Apply** to materialize repository changes
- Repository root is runtime execution context passed to **Apply Service**, not part of **Apply**
- **Apply Decisions** are required only for `needsMergeStrategy` **Planned File Outcomes**
- **Apply Decisions** contain entries only for `needsMergeStrategy` **Planned File Outcomes**
- **Apply Decisions** are keyed by planned file path
- An **Apply** is invalid when any `needsMergeStrategy` **Planned File Outcome** is missing an **Apply Decision**
- An **Apply** is invalid when it contains an **Apply Decision** for a non-conflicted path
- In this context, an **Apply Decision** is `override` or `skip`
- `abort` is a UI cancellation action and is outside the domain model
- **Init** prepares repo-wide infrastructure before **Blueprint** and **Plan** operate on it
- A **Plan** may create **Targets** from scratch inside an initialized repository
- A **Target** contributes base workspace scaffold through its **Target Contribution**
- A **Module** contributes capability-specific changes through its **Module Contribution**
- A **Module Contribution** may write only to its **Owning Target**
- Cross-target effects are modeled through **Required Target** and **Required Module** dependencies, not by writing into another target directly
- A **Target Contribution** and **Module Contribution** declare **Desired Contributions** only
- **Plan** owns merge and conflict detection while projecting **Desired Contributions** onto the repository snapshot
- **Apply Service** owns execution policy for unresolved conflicts through **Apply Decisions**
- A **Planned File Outcome** carries the desired outcome for a file path, not just a classification label
- File-specific merge strategies such as `package.json`, barrel files, and `tsconfig` are implementation details under a **Planned File Outcome**, not separate top-level planning concepts
- `tsconfig.json` is usually introduced once by scaffold; later drift is treated as conflict rather than planner-managed merge behavior
- Merge handlers like `package.json` parsing or barrel parsing are internal planner mechanics, while the public **Plan** exposes only the required structural outcome
- A **Desired Contribution** may use **Contribution Tokens** that are resolved against the owning **Target** context
- A **Target Identity** is distinct from the canonical target path/key string of the same **Target**
- **Target Identity** owns canonical target derivation and matching behavior in the domain model
- **Target Identity** is instantiated canonically as a domain class rather than wrapped later at service boundaries
- A **Target Identity** may preserve user-facing naming, while **Target Path** and **Target Key** are derived by slugifying the name into canonical repo-safe form
- A **Target Identity** derives **Target Path** and **Target Key** using repo conventions
- A **Target Identity** evaluates **Supported On** compatibility through `matches(supportedOn)`
- **Target Identity** stops at `toKey()`, `toPath()`, and `matches(supportedOn)`; scaffold-specific contribution context stays outside the value object
- Package public entrypoints are expressed as **Desired Contributions**, not as a separate composition concept

## Example dialogue

> **Dev:** "If I select the server target with the API module, does the Blueprint also include repo bootstrap files?"
> **Domain expert:** "No. Init handles the repo substrate first. The Blueprint resolves target and module dependencies, and the Plan can still create the server and domain workspaces from scratch."

> **Dev:** "Does the server API module depend on the domain target, the domain API module, or both?"
> **Domain expert:** "Both. The domain target must exist as a workspace, and the domain API module must exist as a capability on that workspace."

> **Dev:** "If I select a target with no modules, does it still produce files?"
> **Domain expert:** "Yes. The target contributes the workspace scaffold, and modules add capability-specific overlays on top."

> **Dev:** "Does a module decide how `package.json` gets merged?"
> **Domain expert:** "No. The module declares the desired entries, and the Plan decides whether that is a create, modify, unchanged result, or a conflict."

> **Dev:** "How does one server definition work for both `apps/admin-api` and `apps/public-api`?"
> **Domain expert:** "The contribution uses `{{targetDir}}`. The planner resolves that token from the selected target before comparing the desired files to the repo snapshot."

> **Dev:** "Is `packages/domain` the identity of the target or just where it lives?"
> **Domain expert:** "It is the canonical target path/key. The identity is `{ kind: 'package', name: 'domain' }`."

> **Dev:** "What path does `{ kind: 'server', name: 'api' }` resolve to?"
> **Domain expert:** "`apps/server-api`. Non-package targets resolve to `apps/{kind}-{name}`, while packages resolve to `packages/{name}`."

> **Dev:** "How do we know whether `domain-api` can be added to a target?"
> **Domain expert:** "The module definition carries a declarative **Supported On** rule. `domain-api` is supported on the domain package target, while `http-api-server` is supported on server targets."

> **Dev:** "Can `supportedOn` express wildcards or exclusions?"
> **Domain expert:** "Not for now. It matches either a target kind or an exact target identity."

> **Dev:** "When a module depends on the domain package, does it point at `packages/domain`?"
> **Domain expert:** "No. It points at the target identity `{ kind: 'package', name: 'domain' }`. The canonical target path/key is derived later."

> **Dev:** "Why is `./Api` a separate composition concept instead of just part of the module output?"
> **Domain expert:** "It should not be separate. Public entrypoints are part of the desired repository state and belong in target or module contributions."

> **Dev:** "Should Blueprint carry the generated file contributions too?"
> **Domain expert:** "No. Blueprint stays a resolved dependency graph. Plan looks up and normalizes contributions afterward."

> **Dev:** "If the server API module needs the domain package, can it write files into `packages/domain` itself?"
> **Domain expert:** "No. A module contributes only to its owning target. Cross-target changes happen by resolving dependencies so the other target and module contribute their own outputs."

## Flagged ambiguities

- "target" was being stretched to include repo-wide bootstrap concerns like `root-bootstrap` — resolved: **Target** is reserved for concrete workspaces on disk.
- "module" previously referred only to target modules — resolved: **Module** is the capability unit attached to a **Target** in this context.
- it was unclear whether **Module** meant the reusable capability or its per-target occurrence — resolved: use **Module** for the capability type and **Attached Module** for its occurrence on an **Owning Target**.
- "base folder structure" was ambiguous between repo-wide substrate and target workspaces — resolved: **Init** owns only repo-wide substrate; **Plan** may create target workspaces.
- "dependency" was too broad to distinguish workspace existence from capability requirements — resolved: use **Required Target** and **Required Module** separately.
- "base module" would blur workspace scaffold with capability overlays — resolved: use **Target Contribution** for scaffold and **Module Contribution** for overlays.
- "contribution" could have implied both desired state and merge behavior — resolved: contributions express desired state only; planner policy stays in **Plan**.
- "template" could imply arbitrary generation logic — resolved: use a small explicit set of **Contribution Tokens** resolved from target context.
- the code was using identity, path, and ID interchangeably for targets — resolved: distinguish **Target Identity** from the canonical target path/key string used in scaffold planning.
- it was unclear whether **Target Key** and **Target Path** should remain distinct in this context — resolved: collapse them to the same canonical string for scaffold planning.
- it was unclear whether **Target Key** and **Target Path** should collapse into one API because they currently serialize the same way — resolved: keep them as separate domain concepts and expose separate operations for each.
- it was unclear whether graph node identifiers were the same thing as **Target Key** — resolved: use **Blueprint Node ID** for graph nodes and reserve **Target Key** for **Target** identifiers only.
- it was unclear whether **Blueprint Node ID** should be ad hoc string concatenation or a canonical schema format — resolved: use canonical string formats, with **Attached Module** node IDs derived as `TargetKey#ModuleId`.
- it was unclear whether the public **Blueprint** boundary should be rich behavior or simple graph data — resolved: keep **Blueprint** as simple graph data with minimal helpers.
- it was unclear whether selection resolution should remain embedded in **BlueprintService** — resolved in the current implementation: keep selection validation and dependency-closure resolution together in **BlueprintService**.
- it was unclear whether selection validation should be split from selection resolution — resolved in the current implementation: keep validation inside **BlueprintService**.
- it was unclear whether target paths were input data or derived convention — resolved: derive **Target Path** centrally from **Target Identity** using repo conventions.
- it was unclear whether **Target Identity** should remain plain schema data or become a domain value object — resolved: **Target Identity** is a behavior-bearing domain value object that owns canonical derivation and matching behavior.
- it was unclear whether rich **Target Identity** behavior should live on a canonical schema/class or on a wrapper around plain decoded data — resolved: use a canonical domain class for **Target Identity** throughout the scaffold flow.
- it was unclear what users were allowed to put in `TargetIdentity.name` — resolved: accept any non-empty user-facing name and derive canonical target keys and paths by slugifying it.
- module compatibility was encoded as arbitrary code — resolved: use declarative **Supported On** rules in module definitions.
- it was unclear whether **Supported On** compatibility should be evaluated by catalog code or by **Target Identity** — resolved: **Target Identity** owns the compatibility predicate as domain behavior.
- it was unclear what the canonical compatibility method should be called — resolved: use `matches(supportedOn)` as the boolean predicate on **Target Identity**.
- it was unclear whether scaffold contribution-token context should also move onto **Target Identity** — resolved: no; keep the value object boundary to `toKey()`, `toPath()`, and `matches(supportedOn)`.
- module compatibility could have grown into a rule language — resolved: **Supported On** only matches target kind or exact target identity for now.
- dependency declarations could have leaked technical identifiers — resolved: dependencies reference **Target Identity**, not target path or key.
- "composition" was an overly abstract label for published outputs — resolved: public entrypoints are modeled directly as **Desired Contributions**.
- it was unclear whether Blueprint should contain generated output data — resolved: **Blueprint** stays graph-only; **Plan** resolves contributions afterward.
- cross-target file generation could have been hidden inside a module — resolved: a **Module Contribution** only affects its **Owning Target**; cross-target effects use explicit dependencies.
- it was unclear whether **Blueprint** should preserve direct selection provenance — resolved: **Blueprint** represents only the resolved dependency closure; direct selection provenance is not part of the domain boundary.
- it was unclear whether selected and implied **Targets** should remain distinct in **Blueprint** — resolved: they collapse to the same node when they have the same identity.
- it was unclear whether **Target** to **Attached Module** ownership should be nested structure or graph structure — resolved: model ownership as real graph edges in **Blueprint**.
- it was unclear whether ownership and dependency should be collapsed into one edge kind — resolved: keep ownership and dependency as distinct edge kinds in **Blueprint**.
- it was unclear whether **Required Target** becomes redundant when a matching **Required Module** exists — resolved: preserve both edges when both requirements are declared.
- it was unclear whether **Attached Module** nodes should exist only internally or also in the public **Blueprint** boundary — resolved: expose both **Target** and **Attached Module** nodes publicly.
- it was unclear whether **Plan** should store both canonical planning data and pre-rendered navigation structure — resolved: **Plan** stores canonical planned file outcomes and conflicts; tree and directory views are derived presentations.
- it was unclear whether directories should be first-class planned outcomes — resolved: **Plan** is about planned file outcomes only; directories are derived from file paths.
- it was unclear whether **Plan** should expose only file classifications or also the desired file state — resolved: **Plan** carries a **Planned File Outcome** with the desired outcome for each planned file path.
- it was unclear whether file kinds like `package.json`, barrel files, and `tsconfig` were separate planning concepts — resolved: the domain split is **Authoritative File Outcome** vs **Structural Merge Outcome**; file-specific strategies stay implementation details.
- it was unclear whether `tsconfig.json` should be treated as mergeable structure or authoritative output — resolved: it is an **Authoritative File Outcome** because scaffold usually adds it once and treats later drift as conflict.
- it was unclear whether the public **Plan** should expose merge strategy types like `package.json` or barrel handling — resolved: the public boundary exposes required structure only; merge strategy names stay internal to the planner.
- it was unclear whether desired-outcome resolution and repo-state comparison should be separate planning services — resolved: **PlanService** keeps both responsibilities as one planning boundary.
- it was unclear whether **PlanService** should expose intermediate planner stages publicly — resolved: it exposes a single public planning operation and keeps lower-level stages private.
- it was unclear whether file conflict policies like `override` and `skip` belong inside **Plan** — resolved: conflict policy is modeled as **Apply Decisions** consumed by **Apply Service**, while **Plan** remains policy-free.
- it was unclear whether `abort` should be modeled in-domain — resolved: `abort` is a UI cancellation action outside the domain model and not part of **Apply**.
- it was unclear whether **Apply** should carry only decisions or also the **Plan** — resolved: **Apply** is the execution intent and embeds the **Plan** it executes.
- it was unclear whether missing per-file conflict decisions should be defaulted during apply — resolved: missing decisions make **Apply** invalid and **Apply Service** fails fast.
- it was unclear whether extra per-file decisions for non-conflicted paths should be ignored — resolved: extra decisions make **Apply** invalid and **Apply Service** rejects the execution intent.
- it was unclear whether repository root belongs inside **Apply** — resolved: repository root is runtime context supplied to **Apply Service** from CLI/UI, not persisted in **Apply**.
