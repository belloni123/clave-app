import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['mediainfo.js'],
  outputFileTracingIncludes: {
    '/api/social/**': ['./node_modules/mediainfo.js/dist/MediaInfoModule.wasm'],
  },
};

export default nextConfig;
