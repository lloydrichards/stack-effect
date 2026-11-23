import { MemoryFileSystem } from "@effect-vfs/memory";
import * as BrowserCrypto from "@effect/platform-browser/BrowserCrypto";
import { Layer, Path } from "effect";

/** The platform Recipe Builder provides to `RecipePreviewer.layer`. */
export const previewPlatform = Layer.merge(
  Layer.provideMerge(MemoryFileSystem.layer, BrowserCrypto.layer),
  Path.layer,
);
