"use client";
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** The browser uses Firebase only for sign-in. All data goes through the Next.js API, which uses the Admin SDK. */
export const firebaseClientConfigured = Boolean(config.apiKey && config.projectId);

let auth: Auth | undefined;
export function clientAuth(): Auth {
  if (auth) return auth;
  const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
  auth = getAuth(app);
  const emu = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
  if (emu) connectAuthEmulator(auth, `http://${emu}`, { disableWarnings: true });
  return auth;
}
