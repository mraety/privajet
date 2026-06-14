/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLET_ADDRESS?: string;
  readonly VITE_TOKEN_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
