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
  // The @google-cloud gRPC clients load their protobuf descriptors
  // (build/protos/protos.json) through a computed require path that Next's
  // file tracer can't follow, so the JSON is dropped from the standalone
  // output and the client throws "Cannot find module …/protos/protos.json"
  // at runtime. Force-include the descriptors for every API route so Cloud
  // Tasks (and the other gRPC clients) can initialize.
  outputFileTracingIncludes: {
    "/api/**": [
      "./node_modules/@google-cloud/tasks/build/protos/**/*",
      "./node_modules/@google-cloud/kms/build/protos/**/*",
      "./node_modules/@google-cloud/secret-manager/build/protos/**/*",
    ],
  },
};

export default nextConfig;
