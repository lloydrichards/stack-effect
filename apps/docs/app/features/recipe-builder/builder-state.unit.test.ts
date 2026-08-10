import { assert, describe, expect, it } from "vitest";
import {
  buildModuleRelationshipNodes,
  removeModuleSupportSelections,
  toggleTargetModule,
} from "./builder-state";
import type { CatalogModule, SupportSelection } from "./recipe-builder-form";
import {
  clientModuleFixture,
  clientTargetFixture,
  recipeCatalogFixture,
} from "./recipe-fixtures";

const childModuleFixture: CatalogModule = {
  id: "client-child",
  title: "Client child",
  description: "Required child module",
  visibility: "internal",
  dependencies: [],
  implications: [],
  children: [{ requirement: "optional", moduleId: "client-leaf" }],
};

const leafModuleFixture: CatalogModule = {
  id: "client-leaf",
  title: "Client leaf",
  description: "Nested optional module",
  visibility: "public",
  dependencies: [],
  implications: [],
  children: [],
};

const parentModuleFixture: CatalogModule = {
  id: "client-parent",
  title: "Client parent",
  description: "Parent module with nested support",
  visibility: "public",
  dependencies: [],
  implications: [],
  children: [{ requirement: "required", moduleId: "client-child" }],
};

const unrelatedModuleFixture: CatalogModule = {
  id: "client-unrelated",
  title: "Unrelated client module",
  description: "A separate support selection",
  visibility: "public",
  dependencies: [],
  implications: [],
  children: [],
};

describe("recipe builder state", () => {
  it("should keep root configuration children out of dependency relationships", () => {
    expect(
      buildModuleRelationshipNodes(
        parentModuleFixture,
        { kind: "client-react", name: "web" },
        {
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
        },
      ),
    ).toEqual([]);
  });

  it("should retain nested configuration beneath a required dependency", () => {
    const rootWithDependency: CatalogModule = {
      ...unrelatedModuleFixture,
      dependencies: [
        {
          _tag: "required-module",
          target: { kind: "client-react", name: "nested-web" },
          moduleId: childModuleFixture.id,
        },
      ],
    };

    expect(
      buildModuleRelationshipNodes(
        rootWithDependency,
        { kind: "server", name: "api" },
        {
          ...recipeCatalogFixture,
          targetModules: [
            ...recipeCatalogFixture.targetModules,
            {
              owner: { kind: "client-react", name: "nested-web" },
              modules: [childModuleFixture, leafModuleFixture],
            },
          ],
        },
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

  it("should add an implied target when a module with a cross-target implication is selected", () => {
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

  it("should preserve a shared implied module when one source module is removed", () => {
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

  it("should remove a dependency-created target when its originating module is removed", () => {
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

  it("should remove nested support selections when their parent module is removed", () => {
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
});
