// oxlint-disable-next-line effecttsgo/node-builtin-import -- Packaging operates on compiled artifacts.
import { copyFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
copyFileSync(
  new URL("package.publish.json", root),
  new URL("package.json", output),
);
copyFileSync(new URL("README.md", root), new URL("README.md", output));
if (existsSync(new URL("LICENSE", root))) {
  copyFileSync(new URL("LICENSE", root), new URL("LICENSE", output));
}
