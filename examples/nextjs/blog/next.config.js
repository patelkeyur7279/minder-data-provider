/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  /**
   * Compiler options for styled-jsx
   * Enables CSS-in-JS with the <style jsx> syntax
   */
  compiler: {
    styledComponents: false,
  },

  /**
   * Enable experimental features if needed
   */
  experimental: {
    // None needed for basic example
  },
};

module.exports = nextConfig;
