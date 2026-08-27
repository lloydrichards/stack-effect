import {
  ClassicArchitecture,
  DddArchitecture,
  type ModuleDefinition,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  configTypescriptViteContents,
  dddConfigTypescriptViteContents,
} from "../content/client";

const supportedOn: (typeof ModuleDefinition.Type)["supportedOn"] = [
  { _tag: "kind", kind: TargetKind.make("client-react") },
  { _tag: "kind", kind: TargetKind.make("client-foldkit") },
];

const dependencies: (typeof ModuleDefinition.Type)["dependencies"] = [];

const contributions: (typeof ModuleDefinition.Type)["contributions"] = [
  {
    _tag: "file",
    path: "packages/config-typescript/vite.json",
    contents: configTypescriptViteContents,
  },
  {
    _tag: "pkg-json-entry",
    path: "packages/config-typescript/package.json",
    field: "exports",
    name: "./base.json",
    value: "./base.json",
  },
  {
    _tag: "pkg-json-entry",
    path: "packages/config-typescript/package.json",
    field: "exports",
    name: "./vite.json",
    value: "./vite.json",
  },
];

const dddContributions: (typeof ModuleDefinition.Type)["contributions"] = [
  {
    _tag: "file",
    path: "packages/config-typescript/vite.json",
    contents: dddConfigTypescriptViteContents,
  },
  ...contributions.slice(1),
];

export const configModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("config-typescript-vite"),
    title: "Config TypeScript Vite",
    description: "Vite TypeScript preset for client applications",
    visibility: "internal",
    supportedOn,
    dependencies,
    contributions,
    architecture: {
      default: ClassicArchitecture,
      variants: [
        {
          id: DddArchitecture,
          supportedOn,
          dependencies,
          contributions: dddContributions,
        },
      ],
    },
  },
];
