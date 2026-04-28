import { type ModuleId, TargetIdentity } from "@repo/domain/Scaffold";
import type { ModuleDefinition } from "../catalog/ModuleCatalog";
import {
  domainApiContents,
  serverHealthContents,
  serverHelloContents,
} from "./content/api";

export const moduleRegistry = new Map<typeof ModuleId.Type, ModuleDefinition>([
  [
    "domain-api",
    {
      moduleId: "domain-api",
      supportedOn: [
        {
          _tag: "identity",
          identity: new TargetIdentity({
            kind: "package",
            name: "domain",
          }),
        },
      ],
      dependencies: [],
      contributions: {
        files: [
          {
            path: "{{targetPath}}/src/Api.ts",
            contents: domainApiContents,
          },
        ],
        exports: [
          {
            path: "{{targetPath}}/package.json",
            name: "./Api",
            value: "./src/Api.ts",
          },
        ],
        dependencies: [],
        scripts: [],
        barrelExports: [
          {
            barrelPath: "{{targetPath}}/src/index.ts",
            exportPath: "./Api",
          },
        ],
        tsconfigs: [],
      },
    },
  ],
  [
    "http-api-server",
    {
      moduleId: "http-api-server",
      supportedOn: [
        {
          _tag: "kind",
          kind: "server",
        },
      ],
      dependencies: [
        {
          requiredTarget: {
            identity: new TargetIdentity({
              kind: "package",
              name: "domain",
            }),
          },
          requiredModule: {
            target: new TargetIdentity({
              kind: "package",
              name: "domain",
            }),
            moduleId: "domain-api",
          },
        },
      ],
      contributions: {
        files: [
          {
            path: "{{targetPath}}/src/Api/Health.ts",
            contents: serverHealthContents,
          },
          {
            path: "{{targetPath}}/src/Api/Hello.ts",
            contents: serverHelloContents,
          },
        ],
        exports: [],
        dependencies: [],
        scripts: [],
        barrelExports: [],
        tsconfigs: [],
      },
    },
  ],
]);
