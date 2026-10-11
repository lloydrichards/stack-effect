// oxlint-disable-next-line effecttsgo/node-builtin-import -- Packaging cleanup uses Node before the library is built.
import { rmSync } from "node:fs";

// Resolve from this script so cleaning does not depend on the working directory.
rmSync(new URL("../dist/", import.meta.url), { recursive: true, force: true });
