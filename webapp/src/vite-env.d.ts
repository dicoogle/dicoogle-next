/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_WEASIS_BASE_URL: string;
  readonly VITE_DICOMWEB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
