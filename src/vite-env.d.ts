/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_FIREBASE_EMULATORS: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_AUTH_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_DATABASE_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST: string;
  readonly VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT: string;
  readonly VITE_FIREBASE_FUNCTIONS_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  __KGRADES_FIREBASE_EMULATORS_CONNECTED__?: boolean;
}
