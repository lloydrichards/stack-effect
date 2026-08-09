import { MDXProvider } from "@mdx-js/react";
import {
  isRouteErrorResponse,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useMatches,
} from "react-router";
import { AppSidebar } from "~/components/app-sidebar";
import { DocFooter } from "~/components/doc-footer";
import { GithubIcon } from "~/components/icons";
import { TableOfContents } from "~/components/table-of-contents";
import { ThemeToggle } from "~/components/theme-toggle";
import { proseComponents } from "~/components/tokens/prose-components";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "~/components/ui/navigation-menu";
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "~/components/ui/sidebar";
import type { TOCItem } from "~/lib/remark-toc-export";
import { cn } from "~/lib/utils";
import { isPrimaryNavigationActive, primaryNavigation } from "~/nav.config";
import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:wght@400;500;700&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: "Stack Effect" },
  {
    name: "description",
    content: "Composable full-stack TypeScript scaffolding with Effect.",
  },
  { property: "og:title", content: "Stack Effect" },
  {
    property: "og:description",
    content: "Composable full-stack TypeScript scaffolding with Effect.",
  },
  {
    property: "og:url",
    content: "https://github.com/lloydrichards/stack-effect",
  },
];

const themeScript = `
(function() {
  var theme = localStorage.getItem('theme');
  if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();
`;

const umamiWebsiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID;

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isLandingPage = pathname === "/";
  const isBuilderPage = pathname === "/builder";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {umamiWebsiteId ? (
          <script
            defer
            src="https://umami.lloydrichards.dev/script.js"
            data-website-id={umamiWebsiteId}
          />
        ) : null}
        <Meta />
        <Links />
      </head>
      <body>
        {isLandingPage || isBuilderPage ? (
          <div className="flex min-h-screen flex-col">
            <LandingHeader />
            <main className="w-full min-w-0 flex-1 overflow-x-clip px-5 py-8 sm:px-8 lg:px-12 lg:py-10">
              {children}
            </main>
          </div>
        ) : (
          <SidebarProvider>
            <AppSidebar />
            <div className="flex-1 flex flex-col min-w-0">
              <SiteHeader />
              <main className="flex-1 w-full px-6 xl:px-12 xl:pr-[14rem] py-10">
                {children}
              </main>
            </div>
          </SidebarProvider>
        )}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const matches = useMatches();
  const lastMatch = matches[matches.length - 1];
  // biome-ignore lint/suspicious/noExplicitAny: React Router's useMatches handle is untyped
  const toc: TOCItem[] = (lastMatch?.handle as any)?.toc ?? [];
  const hasToc = toc.length > 0;
  const isLandingPage = pathname === "/";
  const isBuilderPage = pathname === "/builder";

  return (
    <MDXProvider components={proseComponents}>
      {!isLandingPage && !isBuilderPage && hasToc && (
        <TableOfContents toc={toc} />
      )}
      <div
        className={cn(
          "mx-auto w-full",
          isLandingPage || isBuilderPage ? "max-w-[96rem]" : "max-w-[72ch]",
        )}
      >
        <Outlet />
        {!isBuilderPage ? <DocFooter /> : null}
      </div>
      {!isLandingPage && !isBuilderPage && hasToc && (
        <TableOfContents toc={toc} desktopOnly />
      )}
    </MDXProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

function SiteHeader() {
  const { state, isMobile } = useSidebar();
  const sidebarVisible = state === "expanded" && !isMobile;

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/50 bg-background/80 backdrop-blur-sm px-6 py-3">
      <SidebarTrigger />
      {!sidebarVisible && (
        <Link
          to="/"
          className="hidden h-11 items-center font-heading text-base font-bold tracking-[-0.02em] whitespace-nowrap min-[30rem]:flex lg:h-9"
        >
          Stack Effect
        </Link>
      )}
      <PrimaryNavigation className="ml-auto" />
      <a
        href="https://github.com/lloydrichards/stack-effect"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex lg:size-9"
        aria-label="GitHub"
      >
        <GithubIcon className="size-5" />
      </a>
      <ThemeToggle />
    </header>
  );
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 w-full max-w-[90rem] items-center gap-4 px-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          className="hidden h-11 items-center font-heading text-base font-bold tracking-[-0.02em] min-[30rem]:flex lg:h-9"
        >
          Stack Effect
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <PrimaryNavigation />
          <a
            href="https://github.com/lloydrichards/stack-effect"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden size-11 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground min-[23rem]:flex lg:size-9"
            aria-label="GitHub"
          >
            <GithubIcon className="size-5" />
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function PrimaryNavigation({ className }: { className?: string }) {
  const { pathname } = useLocation();

  return (
    <NavigationMenu className={className} aria-label="Primary">
      <NavigationMenuList>
        {primaryNavigation.map((item) => (
          <NavigationMenuItem key={item.href}>
            <NavigationMenuLink
              render={<Link to={item.href} />}
              size="header"
              data-active={
                isPrimaryNavigationActive(pathname, item.href) || undefined
              }
              aria-current={
                isPrimaryNavigationActive(pathname, item.href)
                  ? "page"
                  : undefined
              }
            >
              {item.label}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
