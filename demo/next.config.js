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
  // Empty turbopack config to silence warning
  turbopack: {},
};

export default nextConfig;
