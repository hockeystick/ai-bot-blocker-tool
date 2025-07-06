// next.config.js
const path = require('path');

/** @type {import('next').NextConfig} */ // This line can stay, it's a JSDoc comment for type checking in JS
const nextConfig = {
  experimental: {
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },

  output: 'standalone',

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('@sparticuz/chromium', 'playwright-core');
    }
    return config;
  },
};

module.exports = nextConfig;