"use client";

import { useEffect, useRef, useState } from "react";
import { RecipePreviewClient } from "../../worker/recipe-preview-client";
import type {
  BuilderCatalogOutputWire,
  RecipePreviewInputWire,
  RecipePreviewOutputWire,
} from "../../worker/recipe-preview-protocol";
import {
  dependencySourceNames,
  errorMessage,
  mergeTargetInstances,
  ownerKey,
  removeModuleImplications,
  targetKey,
  targetNameError,
  toggleSupportSelection,
  toggleTargetModule,
  uniqueOwners,
} from "./builder-state";

export type TargetModuleRequirement = {
  readonly sourceTargetId: string;
  readonly sourceModuleId: string;
  readonly moduleId: string;
  readonly addedModule: boolean;
};

export type TargetInstance = {
  readonly id: string;
  readonly kind: string;
  readonly name: string;
  readonly modules: ReadonlyArray<string>;
  readonly requirements?: ReadonlyArray<TargetModuleRequirement>;
  readonly addedByDependency?: boolean;
};

export type CatalogModule =
  BuilderCatalogOutputWire["targetModules"][number]["modules"][number];

export type SupportConfiguration = {
  readonly owner: { readonly kind: string; readonly name: string };
  readonly parent: CatalogModule;
  readonly modules: ReadonlyArray<CatalogModule>;
};

export type SupportSelection = SupportConfiguration & {
  readonly selected: ReadonlyArray<string>;
};

export type PreviewState =
  | "starting"
  | "loading"
  | "ready"
  | "invalid"
  | "error";

export type CatalogState = "loading" | "ready" | "error";

export const newTargetTabId = "new-target";

export type StackConfiguration = RecipePreviewInputWire["config"];

const initialConfig: StackConfiguration = {
  name: "my-effect-app",
  runtime: { _tag: "bun" as const },
  typescript: "6" as const,
  monorepo: "turbo",
  lint: "biome",
  format: "biome",
  test: "vitest",
};

export function useRecipeBuilderState() {
  const [config, setConfig] = useState<StackConfiguration>(initialConfig);
  const [gitEnabled, setGitEnabled] = useState(true);
  const [developerExperienceModules, setDeveloperExperienceModules] = useState<
    ReadonlyArray<string>
  >([]);
  const [targets, setTargets] = useState<ReadonlyArray<TargetInstance>>([]);
  const [activeId, setActiveId] = useState(newTargetTabId);
  const [catalog, setCatalog] = useState<BuilderCatalogOutputWire>();
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [preview, setPreview] = useState<RecipePreviewOutputWire>();
  const [previewState, setPreviewState] = useState<PreviewState>("starting");
  const [previewError, setPreviewError] = useState<string>();
  const [compatibilityNotice, setCompatibilityNotice] = useState<string>();
  const [supportSelections, setSupportSelections] = useState<
    ReadonlyArray<SupportSelection>
  >([]);
  const [activeFile, setActiveFile] = useState("");
  const [client, setClient] = useState<RecipePreviewClient>();
  const catalogGenerationRef = useRef(0);
  const previewGenerationRef = useRef(0);
  const resolvedCatalogOwnersRef = useRef("");
  const nextTargetRef = useRef(0);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeTarget = targets.find((target) => target.id === activeId);
  const configurationValid =
    catalog === undefined ||
    (["monorepo", "lint", "format", "test"] as const).every(
      (field) =>
        config[field] === undefined ||
        catalog.configuration[field].some(
          (choice) => choice.value === config[field],
        ),
    );
  const canPreview =
    config.name.trim().length > 0 &&
    configurationValid &&
    targets.every(
      (target) =>
        targetNameError(target, targets) === undefined &&
        target.modules.length > 0,
    );
  const previewTargets = mergeTargetInstances([
    ...targets,
    ...supportSelections.flatMap((selection) =>
      selection.selected.length > 0
        ? [
            {
              id: `support-${ownerKey(selection.owner)}`,
              ...selection.owner,
              modules: [selection.parent.id, ...selection.selected],
            },
          ]
        : [],
    ),
  ]);
  const targetIdentityKey = targets.map(targetKey).join("\u0000");
  const activeModules =
    catalog?.targetModules.find(
      (entry) =>
        activeTarget && ownerKey(entry.owner) === targetKey(activeTarget),
    )?.modules ?? [];

  useEffect(() => {
    const nextClient = new RecipePreviewClient();
    setClient(nextClient);
    setPreviewState("loading");
    return () => nextClient.dispose();
  }, []);

  useEffect(() => {
    if (client === undefined) return;
    setCatalogState((state) => (state === "ready" ? state : "loading"));
    const generation = ++catalogGenerationRef.current;
    let active = true;
    const owners = targets.map(({ kind, name }) => ({ kind, name }));
    resolvedCatalogOwnersRef.current = owners.map(ownerKey).join("\u0000");

    void client
      .catalog({ owners })
      .then((nextCatalog) => {
        if (!active || generation !== catalogGenerationRef.current) return;
        setCatalog(nextCatalog);
        setCatalogState("ready");
        const removedModules = targets.flatMap((target) => {
          const supported = new Set(
            nextCatalog.targetModules
              .find((entry) => ownerKey(entry.owner) === targetKey(target))
              ?.modules.map((module) => module.id) ?? [],
          );
          return target.modules.filter((module) => !supported.has(module));
        });
        if (removedModules.length > 0) {
          setCompatibilityNotice(
            `Removed modules that do not support the renamed target: ${removedModules.join(", ")}.`,
          );
        }
        setTargets((current) => {
          const next = current.map((target) => {
            const modules = nextCatalog.targetModules.find(
              (entry) => ownerKey(entry.owner) === targetKey(target),
            )?.modules;
            if (modules === undefined) return target;
            const supported = new Set(modules.map((module) => module.id));
            const filteredModules = target.modules.filter((module) =>
              supported.has(module),
            );
            return filteredModules.length === target.modules.length &&
              filteredModules.every(
                (module, index) => module === target.modules[index],
              )
              ? target
              : { ...target, modules: filteredModules };
          });
          return next.every((target, index) => target === current[index])
            ? current
            : next;
        });
      })
      .catch((error: unknown) => {
        if (!active || generation !== catalogGenerationRef.current) return;
        setCatalogState("error");
        setPreviewState("error");
        setPreviewError(errorMessage(error));
      });

    return () => {
      active = false;
    };
    // Module selection deliberately does not invalidate catalog metadata.
    // biome-ignore lint/correctness/useExhaustiveDependencies: targetIdentityKey captures the identity fields used by this effect.
  }, [catalogRevision, client, targetIdentityKey]);

  useEffect(() => {
    if (client === undefined) return;
    const generation = ++previewGenerationRef.current;
    let active = true;
    if (!canPreview) {
      setPreviewState("invalid");
      return () => {
        active = false;
      };
    }

    setPreviewState("loading");
    const timeout = window.setTimeout(() => {
      void client
        .preview({
          config,
          recipe: {
            targets: [
              ...(gitEnabled || developerExperienceModules.length > 0
                ? [
                    {
                      target: { kind: "workspace", name: config.name },
                      modules: [
                        ...(gitEnabled ? ["workspace-devenv-git"] : []),
                        ...developerExperienceModules,
                      ],
                    },
                  ]
                : []),
              ...previewTargets.map((target) => ({
                target: { kind: target.kind, name: target.name },
                modules: target.modules,
              })),
            ],
          },
        })
        .then((nextPreview) => {
          if (!active || generation !== previewGenerationRef.current) return;
          setPreview(nextPreview);
          setPreviewState("ready");
          setPreviewError(undefined);
          const resolvedOwners = nextPreview.blueprint.nodes.flatMap((node) =>
            node._tag === "target" ? [node.identity] : [],
          );
          const owners = uniqueOwners([...targets, ...resolvedOwners]);
          const ownersKey = owners.map(ownerKey).join("\u0000");
          if (ownersKey === resolvedCatalogOwnersRef.current) return;
          resolvedCatalogOwnersRef.current = ownersKey;
          const catalogGeneration = ++catalogGenerationRef.current;
          void client.catalog({ owners }).then((resolvedCatalog) => {
            if (
              !active ||
              generation !== previewGenerationRef.current ||
              catalogGeneration !== catalogGenerationRef.current
            )
              return;
            setCatalog(resolvedCatalog);
          });
        })
        .catch((error: unknown) => {
          if (!active || generation !== previewGenerationRef.current) return;
          setPreviewState("error");
          setPreviewError(errorMessage(error));
        });
    }, 200);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [
    canPreview,
    client,
    config,
    developerExperienceModules,
    gitEnabled,
    supportSelections,
    targets,
  ]);

  useEffect(() => {
    const paths = preview?.files.map((file) => file.path) ?? [];
    if (!paths.includes(activeFile)) setActiveFile(paths[0] ?? "");
  }, [activeFile, preview]);

  const renameActiveTarget = (name: string) => {
    if (activeTarget === undefined) return;
    setTargets((current) =>
      current.map((target) =>
        target.id === activeTarget.id ? { ...target, name } : target,
      ),
    );
  };

  const toggleModule = (module: CatalogModule) => {
    if (activeTarget === undefined || catalog === undefined) return;
    const selected = activeTarget.modules.includes(module.id);
    if (selected) setSupportSelections([]);
    setTargets((current) =>
      toggleTargetModule(
        current,
        activeTarget,
        module,
        activeModules,
        catalog,
        () => ++nextTargetRef.current,
      ),
    );
  };

  const toggleSupportModule = (
    configuration: SupportConfiguration,
    module: CatalogModule,
  ) =>
    setSupportSelections((current) =>
      toggleSupportSelection(current, configuration, module),
    );

  const addTarget = (kind: string) => {
    const definition = catalog?.targets.find((target) => target.kind === kind);
    if (definition === undefined) return;
    const sameKindCount = targets.filter(
      (target) => target.kind === kind,
    ).length;
    const baseName = definition.defaultName ?? kind;
    const name =
      sameKindCount === 0 ? baseName : `${baseName}-${sameKindCount + 1}`;
    const id = `${kind}-${++nextTargetRef.current}`;
    setTargets((current) => [...current, { id, kind, name, modules: [] }]);
    setActiveId(id);
  };

  const removeTarget = (id: string) => {
    const index = targets.findIndex((target) => target.id === id);
    const removed = targets.find((target) => target.id === id);
    const withoutSources = (removed?.requirements ?? []).reduce(
      (current, requirement) =>
        removeModuleImplications(
          current.map((target) =>
            target.id === requirement.sourceTargetId
              ? {
                  ...target,
                  modules: target.modules.filter(
                    (moduleId) => moduleId !== requirement.sourceModuleId,
                  ),
                }
              : target,
          ),
          requirement.sourceTargetId,
          requirement.sourceModuleId,
        ),
      targets,
    );
    const remaining = withoutSources.filter((target) => target.id !== id);
    const focusId = remaining[Math.min(index, remaining.length - 1)]?.id;
    setTargets(remaining);
    setSupportSelections([]);
    if (id === activeId) setActiveId(focusId ?? "");
    if (remaining.length === 0) {
      setActiveId(newTargetTabId);
    }
    window.requestAnimationFrame(() =>
      tabRefs.current.get(focusId ?? "")?.focus(),
    );
  };

  return {
    state: {
      activeFile,
      activeId,
      activeModules,
      activeTarget,
      availableTargets:
        catalog?.targets.filter((target) => target.kind !== "workspace") ?? [],
      catalog,
      catalogState,
      config,
      configurationChoices: catalog?.configuration,
      compatibilityNotice,
      developerExperienceModules,
      dependencySourceNames: activeTarget
        ? dependencySourceNames(activeTarget, targets)
        : [],
      gitEnabled,
      newTargetOpen: activeId === newTargetTabId,
      preview,
      previewError,
      previewState,
      requiredModuleIds: new Set(
        activeTarget?.requirements?.map(
          (requirement) => requirement.moduleId,
        ) ?? [],
      ),
      supportSelections,
      targets,
    },
    actions: {
      addTarget,
      configure: (updates: Partial<StackConfiguration>) =>
        setConfig((current) => ({ ...current, ...updates })),
      openTargetSelector: () => setActiveId(newTargetTabId),
      registerTargetTab: (id: string, element: HTMLButtonElement | null) => {
        if (element) tabRefs.current.set(id, element);
        else tabRefs.current.delete(id);
      },
      removeTarget,
      renameActiveTarget,
      retryCatalog: () => setCatalogRevision((revision) => revision + 1),
      selectFile: setActiveFile,
      selectTarget: setActiveId,
      setGitEnabled,
      toggleDeveloperExperienceModule: (moduleId: string) =>
        setDeveloperExperienceModules((current) =>
          current.includes(moduleId)
            ? current.filter((id) => id !== moduleId)
            : [...current, moduleId],
        ),
      toggleModule,
      toggleSupportModule,
    },
  };
}
