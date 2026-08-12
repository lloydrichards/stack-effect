import { Schema } from "effect";
import { assert, describe, expect, it } from "vitest";
import type { SupportSelection } from "../../../../app/components/recipe-builder/form";
import {
  buildModuleRelationshipNodes,
  makeTargetInstance,
  removeModuleSupportSelections,
  removeTargetAndDependencies,
  toggleTargetModule,
} from "../../../../app/components/recipe-builder/target-selector/state";
import {
  CatalogModule,
  RecipeBuilderCatalog,
} from "../../../../app/workers/recipe-builder/domain";
import {
  clientModuleFixture,
  clientTargetFixture,
  recipeCatalogFixture,
  serverTargetFixture,
} from "../recipe-fixtures";

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

  it("should preserve a manually selected module when its implication is removed", () => {
    const selected = toggleTargetModule(
      [clientTargetFixture, serverTargetFixture],
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

    const result = toggleTargetModule(
      selected,
      selectedClient,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 2,
    );

    expect(
      result.find((target) => target.id === serverTargetFixture.id)?.modules,
    ).toEqual(["server-http-api"]);
  });

  it("should remove downstream implied targets when their source target is removed", () => {
    const selected = toggleTargetModule(
      [clientTargetFixture],
      clientTargetFixture,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 1,
    );

    expect(
      removeTargetAndDependencies(selected, clientTargetFixture.id),
    ).toEqual([]);
  });

  it("should remove the upstream source module when its implied target is removed", () => {
    const selected = toggleTargetModule(
      [clientTargetFixture],
      clientTargetFixture,
      clientModuleFixture,
      [clientModuleFixture],
      recipeCatalogFixture,
      () => 1,
    );

    expect(removeTargetAndDependencies(selected, "implied-server-1")).toEqual([
      clientTargetFixture,
    ]);
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
        parentId: parentModuleFixture.id,
        selected: ["client-child"],
      },
      {
        owner: { kind: "client-react", name: "web" },
        parentId: childModuleFixture.id,
        selected: ["client-leaf"],
      },
      {
        owner: { kind: "client-react", name: "web" },
        parentId: unrelatedModuleFixture.id,
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
        parentId: unrelatedModuleFixture.id,
        selected: [],
      },
    ]);
  });

  it("should remove cyclic descendant selections when malformed catalog children form a cycle", () => {
    const cyclicParent = makeCatalogModule({
      ...parentModuleFixture,
      children: [{ requirement: "required", moduleId: "client-child" }],
    });
    const cyclicChild = makeCatalogModule({
      ...childModuleFixture,
      children: [{ requirement: "required", moduleId: "client-parent" }],
    });
    const modules = [cyclicParent, cyclicChild];
    const selections: ReadonlyArray<SupportSelection> = modules.map(
      (parent) => ({
        owner: { kind: "client-react", name: "web" },
        parentId: parent.id,
        selected: [],
      }),
    );

    expect(
      removeModuleSupportSelections(
        selections,
        clientTargetFixture,
        cyclicParent,
        modules,
      ),
    ).toEqual([]);
  });

  it("should fill the first available suffix when default target names have a gap", () => {
    const definition = recipeCatalogFixture.targets.find(
      (target) => target.kind === "client-react",
    );
    assert.isDefined(definition);

    expect(
      makeTargetInstance("client-new", definition, [
        clientTargetFixture,
        { ...clientTargetFixture, id: "client-2", name: "web-2" },
        { ...clientTargetFixture, id: "client-4", name: "web-4" },
      ]).name,
    ).toBe("web-3");
  });
});
