// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;

// minder-data-provider is consumed via `"minder-data-provider": "file:../../../"`
// (see package.json), which npm installs as a symlink:
//   node_modules/minder-data-provider -> ../../../..  (the repo root)
// Metro only indexes files inside `watchFolders`; a symlink whose target
// lives outside that set resolves fine on disk but is invisible to Metro's
// crawler, so the import silently fails to resolve. Adding the repo root
// here is what makes the symlinked package (and its transitive `dist/`
// output) visible to the bundler.
const repoRoot = path.resolve(projectRoot, "../../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [repoRoot];

// minder-data-provider ships platform-specific entry points via the
// package.json "exports" map (e.g. "minder-data-provider/expo"). Metro does
// not resolve package "exports" by default, so it must be opted in here —
// without this, `import ... from "minder-data-provider/expo"` fails to
// resolve and the library would silently be missing from the bundle.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
