import { defineModules, defineTargets, templates } from "@stack-effect/author";
import { packageName, targetPath } from "./tokens.ts";

// Template paths resolve against this directory. Each file is embedded in the
// built catalog exactly as written.
const template = templates(new URL("../templates/", import.meta.url));

export const starterTargets = defineTargets(import.meta.url, [
  {
    // Every project has a workspace target at the repository root. A
    // standalone catalog supplies its own.
    kind: "workspace",
    title: "Workspace",
    description: "The repository root",
    visibility: "internal",
    contributions: [
      {
        _tag: "file",
        path: "package.json",
        contents: template("./workspace/package.json"),
      },
    ],
  },
  {
    kind: "app",
    title: "App",
    description: "A small application",
    defaultName: "demo",
    contributions: [
      {
        _tag: "file",
        path: `${targetPath}/package.json`,
        // Written here rather than in a template file so the package name
        // token survives until a consumer creates the target.
        contents: `${JSON.stringify({ name: packageName, private: true, type: "module" }, null, 2)}\n`,
      },
    ],
  },
]);

export const starterModules = defineModules(import.meta.url, [
  {
    id: "app-greeting",
    title: "Greeting",
    description: "Prints a greeting",
    supportedOn: [{ _tag: "kind", kind: "app" }],
    dependencies: [],
    contributions: [
      {
        _tag: "file",
        path: `${targetPath}/src/greeting.ts`,
        contents: template("./app-greeting/src/greeting.ts"),
      },
    ],
  },
]);
