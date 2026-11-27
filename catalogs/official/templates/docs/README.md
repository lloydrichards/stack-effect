# Documentation Site

From this directory, run `bun run dev` to start the site. Run `build` to prerender the pages, then `preview` to serve the built site locally. Publish `dist/client` to a static host that serves directory index files.

Add MDX files under `app/content/` and register them in `app/docs-pages.ts`. The manifest determines the guide URLs and sidebar order. Edit the theme tokens in `app/app.css` and the homepage in `app/routes/home.tsx`.
