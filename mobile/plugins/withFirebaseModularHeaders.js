const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Injects $RNFirebaseAsStaticFramework = true at the top of the Podfile.
 * Required for @react-native-firebase when useFrameworks: "static" is enabled,
 * so RNFB configures its headers correctly for static framework builds.
 * See: https://github.com/invertase/react-native-firebase/issues/8657
 */
module.exports = function withFirebaseStaticFramework(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (!podfile.includes('$RNFirebaseAsStaticFramework')) {
        podfile = `$RNFirebaseAsStaticFramework = true\n\n${podfile}`;
        fs.writeFileSync(podfilePath, podfile);
      }

      return cfg;
    },
  ]);
};
