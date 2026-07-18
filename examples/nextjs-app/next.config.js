const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This example lives nested inside the library's own repo (which has its
  // own package-lock.json), so Next.js can't correctly infer the workspace
  // root on its own. Pinning it here silences that warning; a real standalone
  // consumer project would not need this.
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
