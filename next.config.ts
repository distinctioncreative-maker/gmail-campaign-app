import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // The production Docker build runs on a memory-constrained Cloud Build
  // machine, where `next build`'s in-line TypeScript + ESLint passes OOM
  // ("Ineffective mark-compacts near heap limit"). We already run `tsc
  // --noEmit` and `eslint` in the local quality gate before every commit, so
  // skipping the redundant in-build passes keeps type/lint safety while
  // letting the image build within memory. Do NOT rely on these as the only
  // check — the pre-commit gate is the source of truth.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
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
