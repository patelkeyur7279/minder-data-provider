#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 * 
 * Generates real bundle size reports for each configuration preset
 * and verifies the claimed 87% reduction from modular imports.
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Analyze Built Bundles
// ============================================================================

const distDir = path.join(__dirname, '..', 'dist');

const bundleAnalysis = {
  timestamp: new Date().toISOString(),
  presets: {
    minimal: {
      name: 'Minimal (CRUD Only)',
      description: 'Basic CRUD operations with TanStack Query',
      modules: ['crud/index'],
      claimed: '45KB',
      actual: 0,
    },
    standard: {
      name: 'Standard (Production SaaS)',
      description: 'CRUD + Auth + Cache + Security',
      modules: ['crud/index', 'auth/index', 'cache/index'],
      claimed: '90KB',
      actual: 0,
    },
    advanced: {
      name: 'Advanced (Enterprise)',
      description: 'Standard + Offline + SSR + WebSocket',
      modules: ['crud/index', 'auth/index', 'cache/index', 'websocket/index', 'ssr/index'],
      claimed: '120KB',
      actual: 0,
    },
    enterprise: {
      name: 'Enterprise (All Features)',
      description: 'All features including DevTools',
      modules: ['index'],
      claimed: '150KB',
      actual: 0,
    },
  },
};

/**
 * Get file size in KB
 */
function getFileSizeKB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.size / 1024).toFixed(2);
  } catch (error) {
    return null;
  }
}

/**
 * Calculate bundle size for a preset
 */
function calculatePresetSize(preset) {
  let totalSize = 0;
  const files = [];

  for (const module of preset.modules) {
    const mjsPath = path.join(distDir, `${module}.mjs`);
    const size = getFileSizeKB(mjsPath);

    if (size) {
      totalSize += parseFloat(size);
      files.push({ module, size: `${size}KB`, path: mjsPath });
    }
  }

  return {
    totalSize: `${totalSize.toFixed(2)}KB`,
    totalSizeBytes: Math.round(totalSize * 1024),
    files,
  };
}

/**
 * Generate analysis report
 */
function generateReport() {
  console.log('\n📦 Bundle Size Analysis\n');
  console.log('=' .repeat(80));

  // Analyze each preset
  for (const [key, preset] of Object.entries(bundleAnalysis.presets)) {
    const analysis = calculatePresetSize(preset);
    preset.actual = analysis.totalSize;
    preset.actualBytes = analysis.totalSizeBytes;
    preset.files = analysis.files;

    console.log(`\n${preset.name}`);
    console.log('-'.repeat(80));
    console.log(`Description: ${preset.description}`);
    console.log(`Claimed:     ${preset.claimed}`);
    console.log(`Actual:      ${preset.actual}`);
    console.log(`Modules:     ${preset.modules.length}`);

    if (preset.files.length > 0) {
      console.log('\nIncluded Files:');
      preset.files.forEach((file) => {
        console.log(`  - ${file.module.padEnd(20)} ${file.size}`);
      });
    }
  }

  // Calculate reduction
  const fullBundle = bundleAnalysis.presets.enterprise.actualBytes;
  const minimalBundle = bundleAnalysis.presets.minimal.actualBytes;
  const reduction = ((fullBundle - minimalBundle) / fullBundle * 100).toFixed(1);

  console.log('\n' + '='.repeat(80));
  console.log('\n📊 Bundle Reduction Analysis');
  console.log('-'.repeat(80));
  console.log(`Full Bundle (index.mjs):    ${bundleAnalysis.presets.enterprise.actual}`);
  console.log(`Minimal Bundle (CRUD only): ${bundleAnalysis.presets.minimal.actual}`);
  console.log(`Reduction:                  ${reduction}% smaller`);
  console.log(`Savings:                    ${((fullBundle - minimalBundle) / 1024).toFixed(2)}KB\n`);

  // Verification status
  const claimedReduction = 87;
  const actualReduction = parseFloat(reduction);
  const verified = Math.abs(actualReduction - claimedReduction) < 10; // Within 10% tolerance

  if (verified) {
    console.log(`✅ VERIFIED: Actual reduction (${reduction}%) matches claimed (${claimedReduction}%)`);
  } else {
    console.log(`⚠️  NEEDS UPDATE: Actual reduction (${reduction}%) differs from claimed (${claimedReduction}%)`);
  }

  // Save report to file
  const reportPath = path.join(__dirname, '..', 'BUNDLE_ANALYSIS.json');
  fs.writeFileSync(reportPath, JSON.stringify(bundleAnalysis, null, 2));
  console.log(`\n💾 Full report saved to: BUNDLE_ANALYSIS.json\n`);

  return bundleAnalysis;
}

// Run analysis
if (require.main === module) {
  // Check if dist exists
  if (!fs.existsSync(distDir)) {
    console.error('❌ Error: dist/ folder not found. Run `yarn build` first.');
    process.exit(1);
  }

  generateReport();
}

module.exports = { generateReport, calculatePresetSize };
