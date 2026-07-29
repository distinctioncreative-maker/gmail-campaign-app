import type { NextConfig } from "next";

const isDevelopment = process.env.NODE_ENV !== "production";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""} https://apis.google.com https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://securetoken.googleapis.com https://identitytoolkit.googleapis.com",
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // The production Docker build runs on a memory-constrained Cloud Build
  // machine, where `next build`'s in-line TypeScript + ESLint passes OOM
  // ("Ineffective mark-compacts near heap limit"). We already run `tsc
  // --noEmit` and `eslint` in the local quality gate before every commit, so
  // skipping the redundant in-build passes keeps type/lint safety while
  // letting the image build within memory. Do NOT rely on this as the only
  // check — the pre-commit gate is the source of truth. (Next 16 no longer
  // runs ESLint during build, so only the TypeScript pass needs disabling.)
  typescript: { ignoreBuildErrors: true },
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), payment=(self), usb=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          ...(!isDevelopment
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
