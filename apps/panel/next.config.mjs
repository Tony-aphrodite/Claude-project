/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Drizzle's query builder uses dynamic require under the hood; whitelisting
  // the workspace packages keeps Next.js from tree-shaking SQL helpers.
  transpilePackages: ["@dpm/db", "@dpm/shared"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
  },
  // Workspace packages use NodeNext-style ".js" import specifiers in their
  // TypeScript source. Webpack needs to know that "./foo.js" should resolve
  // to "./foo.ts" or "./foo.tsx" in those packages.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
    };
    return config;
  },
  // We use the panel only inside the brand's organization; CSP blocks
  // accidental embedding by third parties.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "x-frame-options", value: "DENY" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
