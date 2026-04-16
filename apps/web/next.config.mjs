/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  transpilePackages: [
    "@vitalflow/ui",
    "@vitalflow/auth",
    "@vitalflow/ai",
    "@vitalflow/analytics",
    "@vitalflow/clinical-service",
    "@vitalflow/erp-service",
    "@vitalflow/monetization-service",
    "@vitalflow/notification-service",
    "@vitalflow/workflow-service",
    "@vitalflow/workflows",
    "@vitalflow/integrations",
    "@vitalflow/shared-utils",
    "@vitalflow/types",
  ],
  webpack: (config) => {
    // Source uses NodeNext-style ".js" extensions on relative imports that
    // actually resolve to .ts/.tsx sources. Teach webpack the mapping so the
    // bundler can follow them without requiring every file to be rewritten.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
