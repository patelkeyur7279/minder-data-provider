#!/usr/bin/env node

/**
 * Automatic Peer Dependency Fixer
 * 
 * This script automatically fixes common version issues:
 * 1. Removes React from main node_modules (monorepo)
 * 2. Ensures consistent versions across workspaces
 * 3. Updates package.json if needed
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function fixVersionIssues() {
  log('\n🔧 Auto-fixing version issues...', 'cyan');
  
  const projectRoot = process.cwd();
  let fixed = false;
  
  try {
    // Check if React is in main node_modules (shouldn't be for libraries)
    const mainReactPath = path.join(projectRoot, 'node_modules', 'react');
    const mainReactDomPath = path.join(projectRoot, 'node_modules', 'react-dom');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    // Check if this is a library (has peerDependencies but not dependencies for react)
    const isLibrary = packageJson.peerDependencies && 
                     packageJson.peerDependencies.react &&
                     (!packageJson.dependencies || !packageJson.dependencies.react);
    
    if (isLibrary) {
      log('  📚 Library package detected', 'blue');
      
      // Remove React from main node_modules if it exists
      if (fs.existsSync(mainReactPath)) {
        log('  🗑️  Removing React from main node_modules...', 'yellow');
        try {
          fs.rmSync(mainReactPath, { recursive: true, force: true });
          fixed = true;
          log('  ✓ Removed React from main node_modules', 'green');
        } catch (err) {
          log(`  ⚠️  Could not remove React: ${err.message}`, 'yellow');
        }
      }
      
      if (fs.existsSync(mainReactDomPath)) {
        log('  🗑️  Removing ReactDOM from main node_modules...', 'yellow');
        try {
          fs.rmSync(mainReactDomPath, { recursive: true, force: true });
          fixed = true;
          log('  ✓ Removed ReactDOM from main node_modules', 'green');
        } catch (err) {
          log(`  ⚠️  Could not remove ReactDOM: ${err.message}`, 'yellow');
        }
      }
      
      // Check if React is in dependencies or devDependencies (wrong!)
      if (packageJson.dependencies && packageJson.dependencies.react) {
        log('  ⚠️  React found in dependencies (should be in peerDependencies only)', 'yellow');
        log('  💡 Please move React to peerDependencies manually', 'cyan');
      }
      
      if (packageJson.devDependencies && (packageJson.devDependencies.react || packageJson.devDependencies['react-dom'])) {
        log('  ⚠️  React found in devDependencies', 'yellow');
        log('  💡 For libraries, React should only be in peerDependencies', 'cyan');
        log('  💡 Testing should use the consumer\'s React version', 'cyan');
      }
    }
    
    // Check demo/workspace packages
    const demoPath = path.join(projectRoot, 'demo');
    if (fs.existsSync(demoPath)) {
      const demoPackageJsonPath = path.join(demoPath, 'package.json');
      if (fs.existsSync(demoPackageJsonPath)) {
        const demoPackageJson = JSON.parse(fs.readFileSync(demoPackageJsonPath, 'utf8'));
        
        // Ensure demo has React in dependencies
        if (!demoPackageJson.dependencies || !demoPackageJson.dependencies.react) {
          log('  ⚠️  Demo package missing React dependency', 'yellow');
          log('  💡 Run: cd demo && npm install react react-dom', 'cyan');
        }
      }
    }
    
    if (fixed) {
      log('\n✅ Fixed version issues!', 'green');
      log('💡 You may need to run "npm install" again', 'cyan');
    } else {
      log('\n✅ No issues to fix', 'green');
    }
    
  } catch (error) {
    log(`\n❌ Error fixing versions: ${error.message}`, 'red');
    process.exit(1);
  }
}

// Run fixer
fixVersionIssues();
