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

// 3. Dedup do React. O pnpm aninha dependências e o Metro pode acabar
//    empacotando duas cópias de `react`. Com dois Reacts os hooks quebram em
//    runtime ("Cannot read property 'useMemo' of null" no ContextNavigator do
//    expo-router), porque o dispatcher é registrado num React e lido no outro.
//    Resolvemos todo import de `react` a partir do node_modules do app,
//    garantindo uma instância única — inclusive para o renderer do react-native.
const expoResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const patched =
    moduleName === 'react' || moduleName.startsWith('react/')
      ? { ...context, originModulePath: path.join(projectRoot, 'package.json') }
      : context;
  return expoResolveRequest
    ? expoResolveRequest(patched, moduleName, platform)
    : patched.resolveRequest(patched, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
