import { defineConfig } from "vitest/config";
import path from "node:path";

/** Emulator-backed tests. Run via `npm run test:emulator`, which starts the
 * Firestore emulator around this suite. */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/emulator/**/*.test.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
