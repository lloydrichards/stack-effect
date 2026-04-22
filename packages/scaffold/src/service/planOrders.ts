import { pathOrd, targetIdentityOrd } from "@repo/domain/Order";
import type { Selection } from "@repo/domain/Selection";
import { Order } from "effect";

export const byPathOrd = <A extends { readonly path: string }>() =>
  Order.mapInput(pathOrd, (value: A) => value.path);

export const byExportKeyOrd = <A extends { readonly exportKey: string }>() =>
  Order.mapInput(Order.String, (value: A) => value.exportKey);

export const byDependencySectionAndNameOrd = <
  A extends {
    readonly section: string;
    readonly dependencyName: string;
  },
>() =>
  Order.combineAll([
    Order.mapInput(Order.String, (value: A) => value.section),
    Order.mapInput(Order.String, (value: A) => value.dependencyName),
  ]);

export const byScriptNameOrd = <A extends { readonly scriptName: string }>() =>
  Order.mapInput(Order.String, (value: A) => value.scriptName);

export const byBarrelExportPathOrd = <
  A extends { readonly exportPath: string },
>() => Order.mapInput(Order.String, (value: A) => value.exportPath);

export const selectionTargetOrd = Order.mapInput(
  targetIdentityOrd,
  (target: (typeof Selection.Type.targets)[number]) => target.identity,
);

export const selectionTargetModuleOrd = Order.mapInput(
  Order.String,
  (
    moduleSelection: (typeof Selection.Type.targets)[number]["modules"][number],
  ) => moduleSelection.id,
);

export const repoModuleIdOrd = Order.String;
