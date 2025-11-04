/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["minder-data-provider"],
  experimental: {
    esmExternals: true,
  },
  webpack: (config, { isServer, dev }) => {
    // Extensions for module resolution
    config.resolve.extensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".json",
      ".mjs",
      ".mts",
    ];

    // Handle ESM modules and TypeScript
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };

    return config;
  },
};

export default nextConfig;
