/// <reference types="vite/client" />

declare module "virtual:coding-agent-guide-markdown" {
  const markdown: string;
  export default markdown;
}

interface ImportMetaEnv {
  readonly VITE_UMAMI_WEBSITE_ID?: string;
}
