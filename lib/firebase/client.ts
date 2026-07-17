"use client";

import { initializeApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
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

/** Google sign-in scoped to the company Workspace domain (hint only —
 * the server re-verifies the domain before issuing a session). */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(clientApp());
  const provider = new GoogleAuthProvider();
  const domain = process.env.NEXT_PUBLIC_ALLOWED_DOMAIN;
  if (domain) provider.setCustomParameters({ hd: domain });
  const cred = await signInWithPopup(auth, provider);
  return cred.user.getIdToken();
}
