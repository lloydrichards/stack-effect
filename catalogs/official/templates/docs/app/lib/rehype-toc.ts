import type { Element, Root } from "hast";
import { toString } from "hast-util-to-string";
import { h } from "hastscript";
import { SKIP, visit } from "unist-util-visit";

const isModuleStatement = (node: { type: string }) => node.type === "mdxjsEsm";

export const rehypeToc = () => (tree: Root) => {
  const links: Array<Element> = [];

  // Use the IDs from rehype-slug so duplicate headings get distinct links.
  visit(tree, "element", (heading, index, parent) => {
    if (Object.hasOwn(heading.properties, "dataFootnotes")) return SKIP;

    const id = heading.properties.id;

    if (
      !/^h[1-6]$/.test(heading.tagName) ||
      typeof id !== "string" ||
      index === undefined ||
      !parent
    ) {
      return;
    }

    const title = toString(heading);
    const href = `#${encodeURIComponent(id)}`;

    if (heading.tagName === "h2" || heading.tagName === "h3") {
      links.push(h("li", h("a", { href }, title)));
    }

    parent.children[index] = h("div.linked-heading", [
      heading,
      h("a.heading-anchor", { href, ariaLabel: `Link to ${title}` }, "#"),
    ]);

    return SKIP;
  });

  const mobileOutline = h(
    "details.docs-outline",
    { className: ["xl:hidden"] },
    [
      h("summary", "On this page"),
      h("nav", { ariaLabel: "On this page" }, h("ul", links)),
    ],
  );
  const desktopOutline = h(
    "nav.docs-outline",
    {
      ariaLabel: "On this page",
      className: [
        "hidden",
        "xl:block",
        "xl:sticky",
        "xl:top-8",
        "xl:col-start-2",
        "xl:row-start-1",
      ],
    },
    [h("p", "On this page"), h("ul", links)],
  );

  // Leave MDX imports and exports at the root, including author-defined route handles.
  const article: Element = {
    type: "element",
    tagName: "article",
    properties: { className: ["docs-prose", "typeset"] },
    children: tree.children.filter(
      (node): node is Element["children"][number] =>
        node.type !== "doctype" && !isModuleStatement(node),
    ),
  };

  tree.children = [
    ...tree.children.filter(isModuleStatement),
    ...(links.length > 0 ? [mobileOutline, desktopOutline] : []),
    article,
  ];
};
