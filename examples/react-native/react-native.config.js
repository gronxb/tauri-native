const path = require('path');

module.exports = {
  project: {
    ios: {
      automaticPodsInstallation: true,
    },
  },
  dependencies: {
    '@tauri-native/react-native': {
      root: path.resolve(__dirname, '../../packages/react-native'),
      platforms: {
        ios: {},
      },
    },
  },
};
