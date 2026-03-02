import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyA4rxRqSjMe1cKz7alcsotaLdTK1UWUKpE",
  authDomain: "kgrades.firebaseapp.com",
  databaseURL: "https://kgrades-default-rtdb.firebaseio.com",
  projectId: "kgrades",
  storageBucket: "kgrades.firebasestorage.app",
  messagingSenderId: "393746785062",
  appId: "1:393746785062:web:f04a52527f3948a9edd7e7",
  measurementId: "G-DEER1TDFZK",
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const useFirebaseEmulators =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_USE_FIREBASE_EMULATORS || "").toLowerCase() === "true";

const firebaseEmulatorConfig = {
  authHost: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1",
  authPort: parsePort(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_PORT, 9099),
  databaseHost: import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1",
  databasePort: parsePort(import.meta.env.VITE_FIREBASE_DATABASE_EMULATOR_PORT, 9000),
  functionsHost: import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_HOST || "127.0.0.1",
  functionsPort: parsePort(import.meta.env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT, 5001),
  functionsRegion: import.meta.env.VITE_FIREBASE_FUNCTIONS_REGION || "us-central1",
};

export const auth = getAuth(app);
export const db = getDatabase(app);
export const functions = getFunctions(app, firebaseEmulatorConfig.functionsRegion);

if (useFirebaseEmulators && !window.__KGRADES_FIREBASE_EMULATORS_CONNECTED__) {
  connectAuthEmulator(
    auth,
    `http://${firebaseEmulatorConfig.authHost}:${firebaseEmulatorConfig.authPort}`,
    { disableWarnings: true }
  );
  connectDatabaseEmulator(
    db,
    firebaseEmulatorConfig.databaseHost,
    firebaseEmulatorConfig.databasePort
  );
  connectFunctionsEmulator(
    functions,
    firebaseEmulatorConfig.functionsHost,
    firebaseEmulatorConfig.functionsPort
  );

  window.__KGRADES_FIREBASE_EMULATORS_CONNECTED__ = true;

  console.info("[firebase] Using local emulators", firebaseEmulatorConfig);
}

export { firebaseConfig, firebaseEmulatorConfig, useFirebaseEmulators };
