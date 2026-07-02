// Reanimated v4 needs the worklets Babel plugin or every worklet silently
// no-ops. babel-preset-expo@54 auto-injects `react-native-worklets/plugin`
// when `react-native-worklets` is installed (see babel-preset-expo build/index.js),
// so we only declare the preset here — adding the plugin manually as well would
// apply it twice and Babel would throw "plugin has already been applied".
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
