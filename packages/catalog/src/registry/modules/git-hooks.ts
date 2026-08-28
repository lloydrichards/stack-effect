import {
  ModuleCategory,
  type ModuleDefinition,
  ModuleId,
  TargetIdentity,
  TargetKind,
} from "@repo/domain/Catalog";
import {
  huskyPreCommitContents,
  lefthookYamlContents,
  lintStagedConfigContents,
} from "../content/git-hooks";

const workspaceRoot = new TargetIdentity({
  kind: TargetKind.make("workspace"),
  name: "root",
});

const requiredGit = {
  _tag: "required-module" as const,
  target: workspaceRoot,
  moduleId: ModuleId.make("workspace-devenv-git"),
};

const taskScripts = [
  {
    _tag: "pkg-json-entry" as const,
    path: "{{targetPath}}/package.json",
    field: "scripts" as const,
    name: "git-hooks:format",
    value:
      "{{#if format=biome}}biome format --write{{/if}}{{#if format=oxfmt}}oxfmt{{/if}}",
  },
  {
    _tag: "pkg-json-entry" as const,
    path: "{{targetPath}}/package.json",
    field: "scripts" as const,
    name: "git-hooks:lint",
    value:
      "{{#if lint=biome}}biome lint --write{{/if}}{{#if lint=oxlint}}oxlint --fix{{/if}}",
  },
];

const nextSteps = [
  "Git hooks: Protection starts after the complete initial commit.",
  "Git hooks: Successful fixes may update staged content for that commit; inspect staged and unstaged state after interruption.",
  "Git hooks: non-fixable errors block the commit.",
];

export const gitHookModules: ReadonlyArray<typeof ModuleDefinition.Type> = [
  {
    id: ModuleId.make("workspace-git-hooks-lefthook"),
    title: "Lefthook",
    description: "Run filename-aware format and lint tasks with Lefthook",
    visibility: "internal",
    categories: [ModuleCategory.make("git-hooks")],
    conflictsWith: [ModuleId.make("workspace-git-hooks-husky")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [requiredGit],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/lefthook.yml",
        contents: lefthookYamlContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "lefthook",
        value: "2.1.10",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lefthook:install",
        value: "lefthook install",
      },
      ...taskScripts,
    ],
    scripts: [
      {
        label: "Install Lefthook",
        command: "{{packageManager}} run lefthook:install",
        phase: "post-finalize",
      },
    ],
    nextSteps,
  },
  {
    id: ModuleId.make("workspace-git-hooks-husky"),
    title: "Husky + lint-staged",
    description: "Run filename-aware format and lint tasks with Husky",
    visibility: "internal",
    categories: [ModuleCategory.make("git-hooks")],
    conflictsWith: [ModuleId.make("workspace-git-hooks-lefthook")],
    supportedOn: [{ _tag: "kind", kind: TargetKind.make("workspace") }],
    dependencies: [requiredGit],
    contributions: [
      {
        _tag: "file",
        path: "{{targetPath}}/.husky/pre-commit",
        contents: huskyPreCommitContents,
      },
      {
        _tag: "file",
        path: "{{targetPath}}/lint-staged.config.mjs",
        contents: lintStagedConfigContents,
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "husky",
        value: "9.1.7",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "devDependencies",
        name: "lint-staged",
        value: "17.4.1",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "husky:install",
        value: "husky",
      },
      {
        _tag: "pkg-json-entry",
        path: "{{targetPath}}/package.json",
        field: "scripts",
        name: "lint-staged",
        value: "lint-staged",
      },
      ...taskScripts,
    ],
    scripts: [
      {
        label: "Install Husky",
        command: "{{packageManager}} run husky:install",
        phase: "post-finalize",
      },
    ],
    nextSteps,
  },
];
