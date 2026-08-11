import { Schema } from "effect";
import { assert, describe, expect, it } from "vitest";
import {
  buildModuleRelationshipNodes,
  reconcileTargetsWithCatalog,
  removeModuleSupportSelections,
  toggleTargetModule,
} from "../../../app/features/recipe-builder/builder-state";
import type { SupportSelection } from "../../../app/features/recipe-builder/recipe-builder-form";
import {
  CatalogModule,
  RecipeBuilderCatalog,
} from "../../../app/features/recipe-builder/worker/domain";
import {
  clientModuleFixture,
  clientTargetFixture,
  recipeCatalogFixture,
} from "./recipe-fixtures";

const makeCatalogModule = Schema.decodeUnknownSync(CatalogModule);
const makeBuilderCatalog = Schema.decodeUnknownSync(RecipeBuilderCatalog);

const childModuleFixture = makeCatalogModule({
  id: "client-child",
  title: "Client child",
  description: "Required child module",
  visibility: "internal",
  dependencies: [],
  implies: [],
  children: [{ requirement: "optional", moduleId: "client-leaf" }],
});

const leafModuleFixture = makeCatalogModule({
  id: "client-leaf",
  title: "Client leaf",
  description: "Nested optional module",
  visibility: "public",
  dependencies: [],
  implies: [],
  children: [],
});

const parentModuleFixture = makeCatalogModule({
  id: "client-parent",
  title: "Client parent",
  description: "Parent module with nested support",
  visibility: "public",
  dependencies: [],
  implies: [],
  children: [{ requirement: "required", moduleId: "client-child" }],
});

const unrelatedModuleFixture = makeCatalogModule({
  id: "client-unrelated",
  title: "Unrelated client module",
  description: "A separate support selection",
  visibility: "public",
  dependencies: [],
  implies: [],
  children: [],
});

describe("recipe builder state", () => {
  it("should omit configuration children when building root dependency relationships", () => {
    expect(
      buildModuleRelationshipNodes(
        parentModuleFixture,
        { kind: "client-react", name: "web" },
        makeBuilderCatalog({
          ...recipeCatalogFixture,
          targetModules: [
            ...recipeCatalogFixture.targetModules,
            {
              owner: { kind: "client-react", name: "web" },
              modules: [
                parentModuleFixture,
                childModuleFixture,
                leafModuleFixture,
              ],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("should retain nested configuration when it belongs to a required dependency", () => {
    const rootWithDependency = makeCatalogModule({
      ...unrelatedModuleFixture,
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "client-react", name: "nested-web" },
          moduleId: childModuleFixture.id,
        },
      ],
    });

    expect(
      buildModuleRelationshipNodes(
        rootWithDependency,
        { kind: "server", name: "api" },
        makeBuilderCatalog({
          ...recipeCatalogFixture,
          targetModules: [
            ...recipeCatalogFixture.targetModules,
            {
              owner: { kind: "client-react", name: "nested-web" },
              modules: [childModuleFixture, leafModuleFixture],
            },
          ],
        }),
      ),
    ).toMatchObject([
      {
        module: { id: "client-child" },
        requirement: "required",
        children: [
          {
            module: { id: "client-leaf" },
            requirement: "optional",
          },
        ],
      },
    ]);
  });

  it("should add the implied target when selecting a cross-target module", () => {
    const result = toggleTargetModule(
      [clientTargetFixture],
      clientTargetFixture,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 1,
    );

    expect(result).toEqual([
      {
        ...clientTargetFixture,
        modules: ["config-typescript-vite", "client-react-http-api"],
      },
      {
        id: "implied-server-1",
        kind: "server",
        name: "api",
        modules: ["server-http-api"],
        requirements: [
          {
            sourceTargetId: "client-1",
            sourceModuleId: "client-react-http-api",
            moduleId: "server-http-api",
            addedModule: true,
          },
        ],
        addedByDependency: true,
      },
    ]);
  });

  it("should preserve an implied module when another source still requires it", () => {
    const secondClient = {
      ...clientTargetFixture,
      id: "client-2",
      name: "web-2",
    };
    const firstSelection = toggleTargetModule(
      [clientTargetFixture, secondClient],
      clientTargetFixture,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 1,
    );
    const bothSelections = toggleTargetModule(
      firstSelection,
      secondClient,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 2,
    );
    const result = toggleTargetModule(
      bothSelections,
      {
        ...clientTargetFixture,
        modules: ["config-typescript-vite", "client-react-http-api"],
      },
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 3,
    );

    expect(result).toEqual([
      clientTargetFixture,
      {
        ...secondClient,
        modules: ["config-typescript-vite", "client-react-http-api"],
      },
      {
        id: "implied-server-1",
        kind: "server",
        name: "api",
        modules: ["server-http-api"],
        requirements: [
          {
            sourceTargetId: "client-2",
            sourceModuleId: "client-react-http-api",
            moduleId: "server-http-api",
            addedModule: true,
          },
        ],
        addedByDependency: true,
      },
    ]);
  });

  it("should remove a dependency-created target when its source module is deselected", () => {
    const selected = toggleTargetModule(
      [clientTargetFixture],
      clientTargetFixture,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 1,
    );
    const selectedClient = selected.find(
      (target) => target.id === clientTargetFixture.id,
    );
    assert.isDefined(selectedClient);

    expect(
      toggleTargetModule(
        selected,
        selectedClient,
        clientModuleFixture,
        [clientModuleFixture],
        recipeCatalogFixture,
        () => 2,
      ),
    ).toEqual([clientTargetFixture]);
  });

  it("should remove nested support selections when their parent module is deselected", () => {
    const modules = [
      parentModuleFixture,
      childModuleFixture,
      leafModuleFixture,
      unrelatedModuleFixture,
    ];
    const selections: ReadonlyArray<SupportSelection> = [
      {
        owner: { kind: "client-react", name: "web" },
        parent: parentModuleFixture,
        modules,
        selected: ["client-child"],
      },
      {
        owner: { kind: "client-react", name: "web" },
        parent: childModuleFixture,
        modules,
        selected: ["client-leaf"],
      },
      {
        owner: { kind: "client-react", name: "web" },
        parent: unrelatedModuleFixture,
        modules,
        selected: [],
      },
    ];

    expect(
      removeModuleSupportSelections(
        selections,
        clientTargetFixture,
        parentModuleFixture,
        modules,
      ),
    ).toEqual([
      {
        owner: { kind: "client-react", name: "web" },
        parent: unrelatedModuleFixture,
        modules,
        selected: [],
      },
    ]);
  });

  it("should remove selected modules when the resolved catalog no longer supports them", () => {
    const target = {
      ...clientTargetFixture,
      modules: ["config-typescript-vite", "client-react-http-api"],
    };
    const catalog = makeBuilderCatalog({
      ...recipeCatalogFixture,
      targetModules: recipeCatalogFixture.targetModules.map((entry) =>
        entry.owner.kind === "client-react"
          ? { ...entry, modules: [entry.modules[0]] }
          : entry,
      ),
    });

    expect(reconcileTargetsWithCatalog([target], catalog)).toEqual({
      targets: [{ ...target, modules: ["config-typescript-vite"] }],
      removedModules: ["client-react-http-api"],
    });
  });
});
