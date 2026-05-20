// Metro config — Expo + NativeWind + monorepo pnpm.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Observa o monorepo inteiro (necessário para resolver @rpx/shared).
config.watchFolders = [workspaceRoot];

// 2. Resolve node_modules tanto do app quanto da raiz do workspace.
//    O lookup hierárquico continua ligado: o pnpm guarda dependências
//    transitivas em node_modules/.pnpm e o Metro precisa subir a árvore
//    para resolvê-las (ex: @expo/metro-runtime vizinho do expo-router).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
