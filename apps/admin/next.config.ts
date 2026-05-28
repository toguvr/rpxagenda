import type { NextConfig } from 'next';
import path from 'node:path';

const monorepoRoot = path.join(__dirname, '..', '..');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rpx/shared'],
  // Monorepo: fixa a raiz de tracing. Sem isso o Next pode inferir a raiz
  // errada (há múltiplos lockfiles na máquina) e resolver dependências do
  // lugar errado.
  outputFileTracingRoot: monorepoRoot,
  webpack: (config) => {
    // Garante um ÚNICO React (o do admin). O monorepo tem react@18 (mobile)
    // e react@19 (admin); sem este alias o build do Next mistura as cópias e
    // quebra com "Cannot read properties of null (reading 'useContext')".
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.join(__dirname, 'node_modules', 'react'),
      'react-dom': path.join(__dirname, 'node_modules', 'react-dom'),
    };
    return config;
  },
};

export default nextConfig;
