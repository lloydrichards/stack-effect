import { Order } from "effect";
import type { Blueprint } from "./Blueprint";
import type { Plan } from "./Plan";

export const pathStrOrd = Order.mapInput(
  Order.Array(Order.String),
  (path: string) => path.split("/"),
);

export const pathOrd = Order.mapInput(
  pathStrOrd,
  (input: { path: string }) => input.path,
);

export const blueprintNodeOrd = Order.mapInput(
  Order.combineAll<(typeof Blueprint.fields.nodes.Type)[0]>([
    Order.mapInput(Order.String, (node) => node._tag),
    Order.mapInput(Order.String, (node) => node.id),
  ]),
  (node: (typeof Blueprint.fields.nodes.Type)[0]) => node,
);

export const idOrd = Order.mapInput(
  Order.String,
  (input: { id: string }) => input.id,
);

export const planConflictOrd = Order.mapInput(
  Order.String,
  (conflict: typeof Plan.fields.conflicts.schema.Type): string => {
    switch (conflict._tag) {
      case "packageJsonExports":
        return `packageJsonExports:${conflict.path}:${conflict.exportKey}`;
      case "packageJsonDependencies":
        return `packageJsonDependencies:${conflict.path}:${conflict.section}:${conflict.dependencyName}`;
      case "packageJsonScripts":
        return `packageJsonScripts:${conflict.path}:${conflict.scriptName}`;
      case "barrelExport":
        return `barrelExport:${conflict.path}:${conflict.exportPath}`;
      case "tsconfig":
        return `tsconfig:${conflict.path}`;
      case "authoritativeFile":
        return `authoritativeFile:${conflict.path}`;
    }
  },
);
