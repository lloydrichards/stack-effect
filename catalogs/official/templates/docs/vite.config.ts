import mdx from "@mdx-js/rollup";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { defineConfig } from "vite";
import { rehypeToc } from "./app/lib/rehype-toc.ts";

const configureMdx = (
  ...remarkPlugins: NonNullable<
    NonNullable<Parameters<typeof mdx>[0]>["remarkPlugins"]
  >
) =>
  mdx({
    providerImportSource: "@mdx-js/react",
    remarkPlugins,
    rehypePlugins: [
      rehypeSlug,
      rehypeToc,
      [
        rehypePrettyCode,
        {
          theme: { light: "github-light", dark: "github-dark" },
          defaultColor: false,
          keepBackground: false,
        },
      ],
    ],
  });

const docsMdx = configureMdx(remarkGfm);

export default defineConfig({
  plugins: [docsMdx, tailwindcss(), reactRouter()],
  resolve: { tsconfigPaths: true },
});
