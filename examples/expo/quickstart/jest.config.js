const path = require("path");

module.exports = {
  preset: "jest-expo",
  // minder-data-provider is consumed via a `file:` symlink to the repo
  // root (see the matching note in metro.config.js). Jest's default
  // resolver walks up from a *file's real path* to find `node_modules`, so
  // requires inside the (symlinked) library source land on the repo
  // root's own node_modules/react (v19, used by the library's own
  // dev/test tooling) instead of this app's node_modules/react (v18.3.1,
  // the version Expo SDK 52 / React Native 0.76 actually require). Two
  // React copies in one tree breaks hooks ("Cannot read properties of
  // null (reading 'useContext')") — pin the shared singletons to this
  // project's own copies so every module, regardless of physical
  // location, gets the same instance.
  moduleNameMapper: {
    "^react$": path.resolve(__dirname, "node_modules/react"),
    "^react/(.*)$": path.resolve(__dirname, "node_modules/react/$1"),
    "^react-native$": path.resolve(__dirname, "node_modules/react-native"),
    "^react-native/(.*)$": path.resolve(
      __dirname,
      "node_modules/react-native/$1"
    ),
    "^react-test-renderer$": path.resolve(
      __dirname,
      "node_modules/react-test-renderer"
    ),
    "^react-test-renderer/(.*)$": path.resolve(
      __dirname,
      "node_modules/react-test-renderer/$1"
    ),
    "^@tanstack/react-query$": path.resolve(
      __dirname,
      "node_modules/@tanstack/react-query"
    ),
  },
};
