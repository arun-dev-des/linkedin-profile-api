import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  // Doc content is read from ../docs and ../README.md at build time.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
