module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // reanimated: false — o app não usa react-native-reanimated; sem isso o
      // babel-preset-expo injeta o plugin de worklets e quebra o bundle.
      ['babel-preset-expo', { jsxImportSource: 'nativewind', reanimated: false }],
      'nativewind/babel',
    ],
  };
};
