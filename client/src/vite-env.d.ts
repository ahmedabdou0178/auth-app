/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API base URL; defaults to same-origin `/api` (nginx proxy in Docker). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
