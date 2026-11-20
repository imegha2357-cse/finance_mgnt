import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase is "configured" when a project id is present. Credentials come from either:
 *  - FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (service account, e.g. on Vercel), or
 *  - the local emulators (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST), or
 *  - Application Default Credentials (e.g. on Google Cloud).
 * Without any Firebase variable the app runs in demo mode with an in-memory store.
 */
export const firebaseConfigured = () => Boolean(process.env.FIREBASE_PROJECT_ID);

/**
 * Demo mode trusts an `x-demo-role` header, so it must never run on a deployment that was meant to use Firebase.
 * If ANY Firebase variable is present but the server-side ones are incomplete, we refuse to serve instead of
 * silently falling back to an open demo.
 */
export function firebaseConfigProblem(): string | null {
  const anyFirebase = Object.keys(process.env).some((k) => /^(NEXT_PUBLIC_)?FIREBASE_/.test(k) && process.env[k]);
  if (!anyFirebase) return null; // pure demo mode
  if (!process.env.FIREBASE_PROJECT_ID) return "FIREBASE_PROJECT_ID is missing on the server";
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!emulator && (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) && !process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.K_SERVICE) {
    return "FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required on the server";
  }
  if (!process.env.NEXT_PUBLIC_FIREBASE_API_KEY) return "NEXT_PUBLIC_FIREBASE_API_KEY is missing, so the browser cannot sign in";
  return null;
}

let app: App | undefined;

function adminApp(): App {
  if (app) return app;
  if (getApps().length) return (app = getApps()[0]);
  const projectId = process.env.FIREBASE_PROJECT_ID!;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;
  app =
    clientEmail && privateKey
      ? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId, storageBucket })
      : initializeApp({ projectId, storageBucket });
  return app;
}

/**
 * Loaded on first use only. firebase-admin/auth pulls in jwks-rsa → jose (ESM-only), which some serverless
 * Node runtimes cannot require(); demo mode never touches it, so it must not be loaded at module import.
 */
export async function adminAuth() {
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(adminApp());
}
export const adminDb = () => getFirestore(adminApp());
export const adminStorage = () => getStorage(adminApp());
