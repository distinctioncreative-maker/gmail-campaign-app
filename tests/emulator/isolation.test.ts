import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import fs from "node:fs";

/**
 * Proves the Firestore Security Rules enforce per-user isolation
 * (spec §27): one salesperson can never read another salesperson's data,
 * and Gmail connections are never client-readable at all.
 *
 * Run with the emulator:  npm run test:emulator
 */
let env: RulesTestEnvironment;

const ALICE = "alice-uid";
const BOB = "bob-uid";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "outreach-rules-test",
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed Alice's data with the Admin context (bypasses rules).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", ALICE), { userId: ALICE, organizationId: "default" });
    await setDoc(doc(db, "users", ALICE, "contacts", "c1"), { email: "lead@x.com" });
    await setDoc(doc(db, "users", ALICE, "campaigns", "camp1"), { name: "Alice campaign" });
    await setDoc(doc(db, "users", ALICE, "gmailConnections", "primary"), {
      encryptedRefreshToken: "secret",
    });
    await setDoc(doc(db, "users", BOB), { userId: BOB, organizationId: "default" });
  });
});

describe("Firestore isolation rules", () => {
  it("lets a user read their own profile and contacts", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertSucceeds(getDoc(doc(alice, "users", ALICE)));
    await assertSucceeds(getDoc(doc(alice, "users", ALICE, "contacts", "c1")));
  });

  it("prevents a user from reading another user's contacts", async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, "users", ALICE, "contacts", "c1")));
  });

  it("prevents a user from reading another user's campaigns", async () => {
    const bob = env.authenticatedContext(BOB).firestore();
    await assertFails(getDoc(doc(bob, "users", ALICE, "campaigns", "camp1")));
  });

  it("never lets anyone read Gmail connections from the client — not even the owner", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(getDoc(doc(alice, "users", ALICE, "gmailConnections", "primary")));
  });

  it("prevents all client writes (server-only mutations)", async () => {
    const alice = env.authenticatedContext(ALICE).firestore();
    await assertFails(setDoc(doc(alice, "users", ALICE, "contacts", "c2"), { email: "y@x.com" }));
  });

  it("prevents unauthenticated reads entirely", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "users", ALICE, "contacts", "c1")));
  });
});
