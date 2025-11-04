import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Force React and React Query to resolve from demo's node_modules
    config.resolve.alias = {
      ...config.resolve.alias,
      'react': resolve(__dirname, 'node_modules/react'),
      'react-dom': resolve(__dirname, 'node_modules/react-dom'),
      '@tanstack/react-query': resolve(__dirname, 'node_modules/@tanstack/react-query'),
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
