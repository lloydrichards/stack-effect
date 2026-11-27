import { MDXProvider } from "@mdx-js/react";
import type { ComponentProps } from "react";
import { Link, matchPath, Outlet, useLocation } from "react-router";
import { CodeBlock } from "../components/code-block";
import { docsPages } from "../docs-pages";

const ScrollableTable = (props: ComponentProps<"table">) => (
  <div
    className="docs-table not-typeset"
    role="region"
    aria-label="Table"
    tabIndex={0}
  >
    <table {...props} />
  </div>
);

const defineComponents = (
  value: NonNullable<ComponentProps<typeof MDXProvider>["components"]>,
) => value;

const components = defineComponents({
  pre: CodeBlock,
  table: ScrollableTable,
});

const Docs = () => {
  const { pathname } = useLocation();

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 md:grid-cols-[11rem_minmax(0,1fr)]">
      <nav aria-label="Documentation" className="self-start md:sticky md:top-8">
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {docsPages.map(({ slug, title }) => {
            const to = slug ? `/docs/${slug}` : "/docs";
            const current = matchPath({ path: to, end: true }, pathname);

            return (
              <li key={slug}>
                <Link
                  to={to}
                  aria-current={current ? "page" : undefined}
                  className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
                >
                  {title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <main id="main" tabIndex={-1} className="docs-article">
        <MDXProvider components={components}>
          <Outlet />
        </MDXProvider>
      </main>
    </div>
  );
};

export default Docs;
