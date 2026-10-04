import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['spacetimedb'],
  turbopack: {
    resolveConditions: ['browser', 'import', 'require', 'default'],
  },
};

export default config;
