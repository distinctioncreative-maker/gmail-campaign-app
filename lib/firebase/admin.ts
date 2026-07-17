import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";

let app: App | undefined;

function getAdminApp(): App {
  if (!app) {
    app =
      getApps()[0] ??
      initializeApp({
        credential: applicationDefault(),
        projectId: env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT_ID || undefined,
      });
  }
  return app;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

let db: Firestore | undefined;
export function firestore(): Firestore {
  if (!db) {
    db = getFirestore(getAdminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}
