import {
  type ModuleDefinition,
  ModuleId,
  TargetKind,
} from "@repo/domain/Catalog";
import { configTypescriptViteContents } from "../content/client";

export const configModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("config-typescript-vite"),
    title: "Config TypeScript Vite",
    description: "Vite TypeScript preset for client applications",
    visibility: "internal",
    supportedOn: [
      { _tag: "kind", kind: TargetKind.make("client-react") },
      { _tag: "kind", kind: TargetKind.make("client-foldkit") },
    ],
    dependencies: [],
    contributions: [
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
    ],
  },
];
