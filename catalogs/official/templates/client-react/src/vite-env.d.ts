/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_ENABLE_DEVTOOLS: string;
  readonly VITE_DEVTOOLS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
