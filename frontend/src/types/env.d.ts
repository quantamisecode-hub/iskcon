/// <reference types="vite/client" />

/**
 * Type definitions for public frontend environment variables.
 * SECURITY: only public, non-sensitive values may appear here.
 * Backend secrets (JWT, database passwords) must NEVER be added.
 */
interface ImportMetaEnv {
  /** Base URL of the backend API, e.g. http://localhost:5000/api */
  readonly VITE_API_BASE_URL?: string;
  /** Axios timeout in milliseconds */
  readonly VITE_API_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}
