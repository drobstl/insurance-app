const { withXcodeProject } = require('expo/config-plugins');

/**
 * Custom config plugin that allows non-modular header includes in framework
 * modules. Required for @react-native-firebase when using useFrameworks: "static".
 */
module.exports = function withFirebaseModularHeaders(config) {
  return withXcodeProject(config, async (cfg) => {
    const project = cfg.modResults;
    project.updateBuildProperty(
      'CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES',
      'YES',
    );
    return cfg;
  });
};
