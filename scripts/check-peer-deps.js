#!/usr/bin/env node

/**
 * Automatic Peer Dependency Version Checker
 *
 * This script prevents version conflicts by:
 * 1. Detecting multiple React/ReactDOM installations
 * 2. Checking peer dependency compatibility
 * 3. Warning about potential issues
 * 4. Suggesting fixes
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const COLORS = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function checkReactVersions() {
  log("\n🔍 Checking React versions...", "cyan");

  const projectRoot = process.cwd();
  const issues = [];
  const warnings = [];

  try {
    // Check if this is a workspace/monorepo
    const isMonorepo =
      fs.existsSync(path.join(projectRoot, "demo")) ||
      fs.existsSync(path.join(projectRoot, "packages"));

    if (isMonorepo) {
      log("  📦 Monorepo detected", "blue");
    }

    // Get installed React versions
    let reactVersions = new Map();
    let reactDomVersions = new Map();

    // Check main package
    try {
      const mainReact = path.join(
        projectRoot,
        "node_modules",
        "react",
        "package.json"
      );
      const mainReactDom = path.join(
        projectRoot,
        "node_modules",
        "react-dom",
        "package.json"
      );

      if (fs.existsSync(mainReact)) {
        const version = JSON.parse(fs.readFileSync(mainReact, "utf8")).version;
        reactVersions.set("main", version);
        log(`  ✓ Main package React: ${version}`, "green");
      }

      if (fs.existsSync(mainReactDom)) {
        const version = JSON.parse(
          fs.readFileSync(mainReactDom, "utf8")
        ).version;
        reactDomVersions.set("main", version);
      }
    } catch (err) {
      // React not installed in main package (this is OK for libraries)
    }

    // Check demo/workspace packages
    if (isMonorepo) {
      const workspaces = ["demo", "packages"];

      for (const workspace of workspaces) {
        const workspacePath = path.join(projectRoot, workspace);
        if (!fs.existsSync(workspacePath)) continue;

        const reactPath = path.join(
          workspacePath,
          "node_modules",
          "react",
          "package.json"
        );
        const reactDomPath = path.join(
          workspacePath,
          "node_modules",
          "react-dom",
          "package.json"
        );

        if (fs.existsSync(reactPath)) {
          const version = JSON.parse(
            fs.readFileSync(reactPath, "utf8")
          ).version;
          reactVersions.set(workspace, version);
          log(`  ✓ ${workspace} React: ${version}`, "green");
        }

        if (fs.existsSync(reactDomPath)) {
          const version = JSON.parse(
            fs.readFileSync(reactDomPath, "utf8")
          ).version;
          reactDomVersions.set(workspace, version);
        }
      }
    }

    // Check for version conflicts
    const uniqueReactVersions = new Set(reactVersions.values());
    const uniqueReactDomVersions = new Set(reactDomVersions.values());

    if (uniqueReactVersions.size > 1) {
      issues.push({
        type: "MULTIPLE_REACT_VERSIONS",
        message: "Multiple React versions detected!",
        versions: Array.from(reactVersions.entries()),
        severity: "error",
      });
    }

    if (uniqueReactDomVersions.size > 1) {
      issues.push({
        type: "MULTIPLE_REACTDOM_VERSIONS",
        message: "Multiple ReactDOM versions detected!",
        versions: Array.from(reactDomVersions.entries()),
        severity: "error",
      });
    }

    // Check React/ReactDOM version match
    for (const [pkg, reactVer] of reactVersions.entries()) {
      const reactDomVer = reactDomVersions.get(pkg);
      if (reactDomVer && reactVer !== reactDomVer) {
        issues.push({
          type: "VERSION_MISMATCH",
          message: `React and ReactDOM version mismatch in ${pkg}`,
          details: { react: reactVer, reactDom: reactDomVer },
          severity: "error",
        });
      }
    }

    // Check peer dependencies
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
    );
    const peerDeps = packageJson.peerDependencies || {};

    if (peerDeps.react) {
      const requiredRange = peerDeps.react;
      for (const [pkg, version] of reactVersions.entries()) {
        if (!satisfiesRange(version, requiredRange)) {
          warnings.push({
            type: "PEER_DEP_WARNING",
            message: `React version in ${pkg} (${version}) may not satisfy peer dependency (${requiredRange})`,
            severity: "warning",
          });
        }
      }
    }

    // Report issues
    if (issues.length > 0) {
      log("\n❌ Issues found:", "red");
      issues.forEach((issue) => {
        log(`  • ${issue.message}`, "red");
        if (issue.versions) {
          issue.versions.forEach(([pkg, ver]) => {
            log(`    - ${pkg}: ${ver}`, "yellow");
          });
        }
        if (issue.details) {
          log(`    ${JSON.stringify(issue.details, null, 2)}`, "yellow");
        }
      });

      log("\n💡 Suggested fixes:", "cyan");
      log("  1. Run: npm run fix-versions", "cyan");
      log("  2. Or manually remove React from main node_modules:", "cyan");
      log("     rm -rf node_modules/react node_modules/react-dom", "cyan");
      log(
        "  3. Ensure React is only in peerDependencies, not dependencies/devDependencies",
        "cyan"
      );

      return false;
    }

    if (warnings.length > 0) {
      log("\n⚠️  Warnings:", "yellow");
      warnings.forEach((warning) => {
        log(`  • ${warning.message}`, "yellow");
      });
    }

    if (issues.length === 0 && warnings.length === 0) {
      log("\n✅ All version checks passed!", "green");
    }

    return issues.length === 0;
  } catch (error) {
    log(`\n⚠️  Error checking versions: ${error.message}`, "yellow");
    return true; // Don't block installation on errors
  }
}

function satisfiesRange(version, range) {
  // Simple range check (supports ^X.Y.Z and >=X.Y.Z || ^A.B.C format)
  try {
    const cleanVersion = version.replace(/[^0-9.]/g, "");
    const [major] = cleanVersion.split(".").map(Number);

    // Extract major versions from range
    const rangeMatches = range.match(/\d+/g);
    if (!rangeMatches) return true;

    const allowedMajors = rangeMatches.map(Number);
    return allowedMajors.includes(major);
  } catch {
    return true; // Assume OK if can't parse
  }
}

// Run check
const success = checkReactVersions();
process.exit(success ? 0 : 1);
