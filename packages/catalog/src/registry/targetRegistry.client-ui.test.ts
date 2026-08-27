import { ModuleId } from "@repo/domain/Catalog";
import { describe, expect, it } from "vitest";
import { clientIndexHtmlContents } from "./content/client";
import {
  clientButtonContents,
  clientCardContents,
  clientInputContents,
  clientSwitchContents,
} from "./content/client-ui";
import { targetRegistry } from "./targetRegistry";

const clientReactTarget = targetRegistry.find(
  ({ kind }) => kind === "client-react",
);
const dddClientReact = clientReactTarget?.architecture?.variants.find(
  ({ id }) => id === "ddd",
);

const dddUiFiles = [
  ["{{targetPath}}/src/components/ui/button.tsx", clientButtonContents],
  ["{{targetPath}}/src/components/ui/card.tsx", clientCardContents],
  ["{{targetPath}}/src/components/ui/input.tsx", clientInputContents],
  ["{{targetPath}}/src/components/ui/switch.tsx", clientSwitchContents],
] as const;

const indexHtmlPath = "{{targetPath}}/index.html";
const isIndexHtml = (contribution: {
  readonly _tag: string;
  readonly path?: string;
}) => contribution._tag === "file" && contribution.path === indexHtmlPath;
type ClientReactContributions = NonNullable<
  typeof clientReactTarget
>["contributions"];

describe("DDD React client target", () => {
  it("keeps the Classic React shell and finalizer behavior unchanged", () => {
    expect(clientReactTarget?.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/package.json",
        }),
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/src/app.tsx",
        }),
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/src/components/theme-toggle.tsx",
        }),
        expect.objectContaining({
          _tag: "pkg-json-entry",
          path: "{{targetPath}}/package.json",
          field: "scripts",
          name: "type-check",
          value: "tsc --noEmit",
        }),
      ]),
    );
    expect(clientReactTarget?.scripts).toEqual([
      {
        label: "Install shadcn client components",
        command:
          "bunx shadcn@latest add button card input switch --yes --overwrite",
      },
    ]);
  });

  it("uses the DDD client-react-web layout while leaving Classic layout behavior unchanged", () => {
    expect(clientReactTarget?.architecture?.default).toBe("classic");
    expect(dddClientReact?.requiredModules).toEqual([
      ModuleId.make("config-typescript-vite"),
    ]);
    expect(dddClientReact?.layout).toEqual({
      _tag: "template",
      path: "apps/client-react-web",
      packageName: "@repo/client-react-web",
      requiresContext: false,
    });
    expect(
      dddClientReact?.contributions?.filter(
        (contribution) => !isIndexHtml(contribution),
      ),
    ).toEqual(
      expect.arrayContaining(
        (clientReactTarget?.contributions ?? []).filter(
          (contribution) => !isIndexHtml(contribution),
        ),
      ),
    );
    expect(dddClientReact?.contributions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/components.json",
        }),
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/src/index.css",
        }),
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/vite.config.ts",
        }),
        expect.objectContaining({
          _tag: "file",
          path: "{{targetPath}}/tsconfig.json",
          conflictOnModify: true,
        }),
      ]),
    );
  });

  it("uses a data favicon only in the DDD index while preserving Classic bytes", () => {
    const indexHtml = (contributions: ClientReactContributions | undefined) =>
      contributions?.filter(isIndexHtml) ?? [];

    const classicIndexHtml = indexHtml(clientReactTarget?.contributions);
    const dddIndexHtml = indexHtml(dddClientReact?.contributions);

    expect(classicIndexHtml).toEqual([
      expect.objectContaining({ contents: clientIndexHtmlContents }),
    ]);
    expect(dddIndexHtml).toHaveLength(1);
    expect(dddIndexHtml[0]).toEqual(
      expect.objectContaining({
        contents: expect.stringContaining('<link rel="icon" href="data:," />'),
      }),
    );
  });

  it("ships its UI components directly and skips the hanging remote script", () => {
    expect(dddClientReact?.scripts).toEqual([]);
    for (const [path, contents] of dddUiFiles)
      expect(dddClientReact?.contributions).toContainEqual({
        _tag: "file",
        path,
        contents,
      });
  });
});
