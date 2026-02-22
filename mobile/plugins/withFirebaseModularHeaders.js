const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Appends a post_install hook to the Podfile that sets
 * CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES
 * on every pod target. Required for @react-native-firebase
 * when useFrameworks: "static" is enabled.
 */
module.exports = function withFirebaseModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      const snippet = `
# --- withFirebaseModularHeaders plugin ---
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
    end
  end
end
`;

      if (!podfile.includes('CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES')) {
        // If there's already a post_install block, inject into it instead
        if (podfile.includes('post_install do |installer|')) {
          podfile = podfile.replace(
            'post_install do |installer|',
            `post_install do |installer|
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end`,
          );
        } else {
          podfile += snippet;
        }
        fs.writeFileSync(podfilePath, podfile);
      }

      return cfg;
    },
  ]);
};
