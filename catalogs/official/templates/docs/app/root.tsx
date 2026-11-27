import {
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { ThemeToggle } from "./components/theme-toggle";
import { sitePages } from "./site-pages";
import "./app.css";

export const meta: Route.MetaFunction = () => [
  { title: "Documentation" },
  { name: "description", content: "Project documentation and guides." },
];

const themeScript = {
  __html: `
  try {
    const theme = localStorage.getItem("docs-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
    }
  } catch {}
`,
};

export const Layout = ({ children }: { children: React.ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <script dangerouslySetInnerHTML={themeScript} />
      <Meta />
      <Links />
    </head>
    <body>
      <a
        className="sr-only focus:not-sr-only focus:fixed focus:z-10 focus:bg-background focus:p-3"
        href="#main"
      >
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-2 sm:px-8">
          <Link className="font-semibold" to="/">
            Documentation
          </Link>
          <div className="flex items-center gap-4">
            {sitePages
              .filter((page) => page.slug)
              .map((page) => (
                <Link key={page.slug} to={`/${page.slug}`} className="text-sm">
                  {page.title}
                </Link>
              ))}
            <ThemeToggle />
          </div>
        </div>
      </header>
      {children}
      <ScrollRestoration />
      <Scripts />
    </body>
  </html>
);

export default Outlet;
