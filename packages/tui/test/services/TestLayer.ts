import { FileSystem, Layer, Path } from "effect";
import { TestConsole } from "effect/testing";
import * as MockTerminal from "./MockTerminal.js";

export const TestLayer = Layer.mergeAll(
  TestConsole.layer,
  FileSystem.layerNoop({}),
  Path.layer,
  MockTerminal.layer,
);
