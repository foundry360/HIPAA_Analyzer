/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  /** When "true" and using `npm run dev`, requests go through Vite proxy at /dev-api (see vite.config.ts). */
  readonly VITE_DEV_API_PROXY?: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
