import { defineModules, templates } from "@repo/authoring";

const template = templates(new URL("../templates/", import.meta.url));

const dependencies = [
  {
    _tag: "required-module",
    target: { kind: "server", name: "api" },
    moduleId: "server-cluster-counter",
  },
  {
    _tag: "required-module",
    target: { kind: "package", name: "domain" },
    moduleId: "domain-counter-contracts",
  },
] as const;

const browserContributions = [
  {
    _tag: "pkg-json-entry",
    path: "{{targetPath}}/package.json",
    field: "dependencies",
    name: "@repo/domain",
    value: "{{workspaceDependency}}",
  },
  {
    _tag: "file",
    path: "{{targetPath}}/src/lib/counter-client.ts",
    contents: template("./cluster-counter-client/src/lib/counter-client.ts"),
  },
] as const;

const foldkitMain = "{{targetPath}}/src/main.ts";
const foldkitImport = {
  moduleSpecifier: "./features/counter",
  namespaceImport: "Counter",
};

export const counterClients = defineModules(import.meta.url, [
  {
    id: "client-react-cluster-counter",
    title: "Cluster Counter Form (React)",
    description: "Increment a server-side counter by ID from a React form",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "client-react" }],
    dependencies,
    contributions: [
      ...browserContributions,
      {
        _tag: "file",
        path: "{{targetPath}}/src/components/counter-form.tsx",
        contents: template(
          "./client-react-cluster-counter/src/components/counter-form.tsx",
        ),
      },
      {
        _tag: "jsx-slot",
        path: "{{targetPath}}/src/app.tsx",
        slotId: "components",
        content: "<CounterForm />",
        import: {
          moduleSpecifier: "./components/counter-form",
          namedImports: ["CounterForm"],
        },
      },
    ],
  },
  {
    id: "client-foldkit-cluster-counter",
    title: "Cluster Counter Form (Foldkit)",
    description:
      "Increment a server-side counter by ID through a Foldkit command",
    supportedRuntimes: ["bun", "node", "deno"],
    supportedOn: [{ _tag: "kind", kind: "client-foldkit" }],
    dependencies,
    contributions: [
      ...browserContributions,
      {
        _tag: "file",
        path: "{{targetPath}}/src/features/counter.ts",
        contents: template(
          "./client-foldkit-cluster-counter/src/features/counter.ts",
        ),
      },
      {
        _tag: "ts-object-field",
        path: foldkitMain,
        targetVariable: "Model",
        functionName: "S.Struct",
        field: "counter",
        value: "Counter.Model",
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "Message",
        functionName: "S.Union",
        argument: "Counter.GotMessage",
        import: foldkitImport,
      },
      {
        _tag: "ts-object-field",
        path: foldkitMain,
        targetVariable: "update",
        functionName: "M.tagsExhaustive",
        field: "GotCounterMessage",
        value: `({ message }) => {
          const [counter, commands] = Counter.update(model.counter, message);
          return {
            model: { ...model, counter },
            commands: Command.mapMessages(commands, (message) => Counter.GotMessage({ message })),
          };
        }`,
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "init",
        functionName: "Init.compose",
        argument: 'Init.child(Counter, "counter", Counter.GotMessage)',
        import: foldkitImport,
      },
      {
        _tag: "ts-call-arg",
        path: foldkitMain,
        targetVariable: "view",
        functionName: "Views.compose",
        argument:
          "Counter.view(model.counter, (message) => Counter.GotMessage({ message }), h)",
        import: foldkitImport,
      },
    ],
  },
]);
