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

    // Exclude platform-specific optional dependencies
    config.resolve.fallback = {
      ...config.resolve.fallback,
      'electron-store': false,
      'expo-secure-store': false,
      '@react-native-async-storage/async-storage': false,
    };

    return config;
  },
};

export default nextConfig;
