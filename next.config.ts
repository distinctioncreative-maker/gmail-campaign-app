import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "firebase-admin",
    "@google-cloud/kms",
    "@google-cloud/tasks",
    "@google-cloud/firestore",
    "@google-cloud/secret-manager",
  ],
};

export default nextConfig;
