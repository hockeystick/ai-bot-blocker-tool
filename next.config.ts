// next.config.ts
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // REQUIRED FOR PLAYWRIGHT/CHROMIUM ON VERCEL
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },

  // REQUIRED FOR PLAYWRIGHT/CHROMIUM ON VERCEL
  output: 'standalone',

  // OPTIONAL BUT RECOMMENDED:
  // Custom webpack configuration for server-side bundles.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('@sparticuz/chromium', 'playwright-core');
    }
    return config;
  },
};

module.exports = nextConfig;