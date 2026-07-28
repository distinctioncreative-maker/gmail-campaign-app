import { getApps, initializeApp, applicationDefault, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { env } from "@/lib/env";

// Next.js bundles each route into its own server chunk, so a plain
// module-scoped `let` singleton here gets duplicated: two different routes'
// first-ever request on a cold instance each think they're the first to call
// firestore() and both try db.settings(), which throws the second time
// because the underlying Firestore instance is a true singleton (keyed by
// app) inside the firebase-admin SDK itself, shared across every chunk.
// globalThis is the one thing actually shared across chunks in the same
// process, so cache the singletons there instead.
declare global {
  var __cadenceAdminApp: App | undefined;
  var __cadenceFirestore: Firestore | undefined;
}

function getAdminApp(): App {
  if (!globalThis.__cadenceAdminApp) {
    globalThis.__cadenceAdminApp =
      getApps()[0] ??
      initializeApp({
        credential: applicationDefault(),
        projectId: env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT_ID || undefined,
      });
  }
  return globalThis.__cadenceAdminApp;
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

export function firestore(): Firestore {
  if (!globalThis.__cadenceFirestore) {
    globalThis.__cadenceFirestore = getFirestore(getAdminApp());
    globalThis.__cadenceFirestore.settings({ ignoreUndefinedProperties: true });
  }
  return globalThis.__cadenceFirestore;
}
