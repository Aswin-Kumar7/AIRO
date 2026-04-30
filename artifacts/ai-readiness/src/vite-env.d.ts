/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full URL of the deployed API server, e.g. https://api.kasparro.com
   *  Leave undefined in local dev — the Vite dev proxy handles /api/* requests. */
  readonly VITE_API_URL?: string;
  readonly BASE_URL: string;
  readonly MODE: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
