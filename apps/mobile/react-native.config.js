// No monorepo pnpm, o autolinking nativo do EAS gera o import errado para o
// pacote `expo` no PackageList.java (`expo.core.ExpoModulesPackage`, namespace
// antigo). Aqui fixamos explicitamente a config android do `expo` para a
// classe correta — `expo.modules.ExpoModulesPackage`.
module.exports = {
  dependencies: {
    expo: {
      platforms: {
        android: {
          packageImportPath: 'import expo.modules.ExpoModulesPackage;',
          packageInstance: 'new ExpoModulesPackage()',
        },
      },
    },
  },
};
