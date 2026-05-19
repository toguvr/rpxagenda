import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rpx/shared'],
  experimental: {
    // Permite import direto de fontes do workspace sem build prévio
  },
};

export default nextConfig;
