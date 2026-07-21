"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
} from "firebase/auth";

function clientApp() {
  return (
    getApps()[0] ??
    initializeApp({
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    })
  );
}

/** Google sign-in. Always shows the account chooser so users can pick or
 * switch accounts (e.g. an alpine vs everest login); `hd: "*"` limits the
 * chooser to Google Workspace accounts. The server re-verifies the domain
 * against the allowlist before issuing a session. */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(clientApp());
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account", hd: "*" });
  const cred = await signInWithPopup(auth, provider);
  return cred.user.getIdToken();
}

/** End the client-side Firebase/Google session so the next sign-in shows the
 * account chooser instead of silently re-selecting the last account. */
export async function signOutGoogle(): Promise<void> {
  await signOut(getAuth(clientApp())).catch(() => {
    // Already signed out — fine.
  });
}
