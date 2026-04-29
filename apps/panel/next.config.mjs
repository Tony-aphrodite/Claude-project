/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Drizzle's query builder uses dynamic require under the hood; whitelisting
  // the workspace packages keeps Next.js from tree-shaking SQL helpers.
  transpilePackages: ["@dpm/db", "@dpm/shared"],
  experimental: {
    serverActions: { bodySizeLimit: "1mb" },
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
