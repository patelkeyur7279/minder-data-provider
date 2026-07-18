import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  main,
  findManifests,
  loadManifest,
  validateManifestMinimal,
  extractProviderInfo,
  generateTable,
  generateCatalogContent,
  CERTIFIED,
  PLANNED,
} from '../scripts/generate-catalog';

describe('generate-catalog', () => {
  const repoRoot = path.join(__dirname, '..');
  const fixturesDir = path.join(__dirname, 'fixtures', 'providers');
  const goodProviderDir = path.join(fixturesDir, 'good-provider');
  const badProviderDir = path.join(fixturesDir, 'bad-provider');
  const outputDir = path.join(repoRoot, 'docs', 'providers');
  const catalogPath = path.join(outputDir, 'CATALOG.md');

  // Ensure output dir exists
  beforeAll(() => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  describe('findManifests', () => {
    it('should find manifest.json files in a directory tree', () => {
      const results = findManifests(fixturesDir);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.path.includes('good-provider'))).toBe(true);
      expect(results.some((r) => r.path.includes('bad-provider'))).toBe(true);
    });

    it('should return empty array if directory does not exist', () => {
      const results = findManifests('/nonexistent/path');
      expect(results).toEqual([]);
    });
  });

  describe('loadManifest', () => {
    it('should load and return valid manifest', () => {
      const manifest = loadManifest(path.join(goodProviderDir, 'manifest.json'));
      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe('@example/provider-fixture');
      expect(manifest?.displayName).toBe('Fixture Provider');
    });

    it('should return null for invalid manifest (with warning)', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
      const manifest = loadManifest(path.join(badProviderDir, 'manifest.json'));
      expect(manifest).toBeNull();
      expect(stderrSpy).toHaveBeenCalled();
      const warnings = stderrSpy.mock.calls.map((c) => c[0]).join('');
      expect(warnings.toLowerCase()).toContain('warning');
      stderrSpy.mockRestore();
    });

    it('should return null for nonexistent file (with warning)', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
      const manifest = loadManifest('/nonexistent/manifest.json');
      expect(manifest).toBeNull();
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });
  });

  describe('validateManifestMinimal', () => {
    it('should pass validation for manifest with name, displayName, and categories', () => {
      const manifest = {
        name: '@test/provider',
        displayName: 'Test',
        categories: ['database'],
        runtimes: ['web'],
        frameworks: [],
      };
      const result = validateManifestMinimal(manifest, 'test.json');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail validation for missing name', () => {
      const manifest = {
        displayName: 'Test',
        categories: ['database'],
      };
      const result = validateManifestMinimal(manifest, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('should fail validation for missing displayName', () => {
      const manifest = {
        name: '@test/provider',
        categories: ['database'],
      };
      const result = validateManifestMinimal(manifest, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('displayName'))).toBe(true);
    });

    it('should fail validation for empty categories', () => {
      const manifest = {
        name: '@test/provider',
        displayName: 'Test',
        categories: [],
      };
      const result = validateManifestMinimal(manifest, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('categories'))).toBe(true);
    });

    it('should fail validation for non-object', () => {
      const result = validateManifestMinimal(null, 'test.json');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('extractProviderInfo', () => {
    it('should extract provider info with all fields', () => {
      const manifest = {
        name: '@minder/provider-test',
        displayName: 'Test Provider',
        categories: ['database', 'auth'],
        runtimes: ['web', 'node'],
        frameworks: ['react', 'nextjs'],
      };
      const info = extractProviderInfo(manifest);
      expect(info.displayName).toBe('Test Provider');
      expect(info.categories).toBe('database, auth');
      expect(info.runtimes).toBe('web, node');
      expect(info.frameworks).toBe('react, nextjs');
    });

    it('should handle missing fields gracefully', () => {
      const manifest = {
        name: '@minder/provider-test',
        displayName: 'Test',
      };
      const info = extractProviderInfo(manifest);
      expect(info.displayName).toBe('Test');
      expect(info.categories).toBe('(none)');
      expect(info.runtimes).toBe('(none)');
      expect(info.frameworks).toBe('(none)');
    });
  });

  describe('generateTable', () => {
    it('should generate markdown table with providers', () => {
      const providers = [
        {
          displayName: 'Provider B',
          categories: 'database',
          runtimes: 'web',
          frameworks: 'react',
        },
        {
          displayName: 'Provider A',
          categories: 'auth',
          runtimes: 'node',
          frameworks: 'nextjs',
        },
      ];
      const table = generateTable(providers);
      expect(table).toContain('| displayName | Categories | Runtimes | Frameworks |');
      expect(table).toContain('Provider A');
      expect(table).toContain('Provider B');
      // Verify sorted order (A before B)
      const aIndex = table.indexOf('Provider A');
      const bIndex = table.indexOf('Provider B');
      expect(aIndex).toBeLessThan(bIndex);
    });

    it('should generate empty table for no providers', () => {
      const table = generateTable([]);
      expect(table).toContain('| displayName | Categories | Runtimes | Frameworks |');
      expect(table).toContain('(none)');
    });

    it('should sort providers by displayName', () => {
      const providers = [
        { displayName: 'Zebra', categories: 'a', runtimes: 'b', frameworks: 'c' },
        { displayName: 'Alpha', categories: 'a', runtimes: 'b', frameworks: 'c' },
        { displayName: 'Beta', categories: 'a', runtimes: 'b', frameworks: 'c' },
      ];
      const table = generateTable(providers);
      const lines = table.split('\n');
      const alphaLine = lines.findIndex((l) => l.includes('Alpha'));
      const betaLine = lines.findIndex((l) => l.includes('Beta'));
      const zebraLine = lines.findIndex((l) => l.includes('Zebra'));
      expect(alphaLine).toBeLessThan(betaLine);
      expect(betaLine).toBeLessThan(zebraLine);
    });
  });

  describe('generateCatalogContent', () => {
    it('should include header with three tiers explanation', () => {
      const content = generateCatalogContent([], []);
      expect(content).toContain('# Provider Catalog');
      expect(content).toContain('Certified');
      expect(content).toContain('Community');
      expect(content).toContain('Planned');
    });

    it('should include all planned providers', () => {
      const content = generateCatalogContent([], []);
      for (const p of PLANNED) {
        expect(content).toContain(p.name);
      }
    });

    it('should render a graceful empty-state message when PLANNED is empty (roadmap complete)', () => {
      // Razorpay (F-R1) and Sentry (F-S1) graduated to CERTIFIED in F-E3,
      // emptying PLANNED — the generator must render a graceful sentence
      // instead of a header-only table.
      expect(PLANNED.length).toBe(0);
      const content = generateCatalogContent([], []);
      expect(content).toContain('No providers are currently planned — the initial roadmap is complete.');
      expect(content).not.toContain('| Provider | Status |');
    });

    it('should NOT contain "all SDKs"', () => {
      const content = generateCatalogContent([], []);
      expect(content).not.toContain('all SDKs');
    });

    it('should include footer with generation message', () => {
      const content = generateCatalogContent([], []);
      expect(content).toContain('Generated by `npm run generate:catalog`');
      expect(content).toContain('do not edit by hand');
    });

    it('should render frameworks column', () => {
      const certified = [
        {
          displayName: 'Test',
          categories: 'db',
          runtimes: 'web',
          frameworks: 'react, nextjs',
        },
      ];
      const content = generateCatalogContent(certified, []);
      expect(content).toContain('react');
      expect(content).toContain('nextjs');
      expect(content).toContain('Frameworks');
    });
  });

  describe('main', () => {
    it('should generate catalog with good provider in Community', () => {
      const result = main({
        extraDirs: [fixturesDir],
        outPath: catalogPath,
        dryRun: true,
      });
      expect(result.community).toBeGreaterThan(0);
      // The real providers/supabase manifest is always scanned (providersDir is
      // unconditional) and @minder/provider-supabase is now in CERTIFIED, so at
      // least that one provider is certified — never assert an exact count here,
      // for the same "future providers may certify" reason as the community check
      // below.
      expect(result.certified).toBeGreaterThanOrEqual(1);
      expect(result.content).toContain('Fixture Provider');
    });

    it('should skip invalid manifest with warning', () => {
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation();
      const result = main({
        extraDirs: [fixturesDir],
        outPath: catalogPath,
        dryRun: true,
      });
      // Hermetic assertion: the INVALID fixture is skipped (with a warning) and
      // the valid one is present. Never assert absolute community counts here —
      // the generator also scans the real providers/ directory, so every real
      // provider that ships would break an exact-count expectation.
      expect(result.community).toBeGreaterThanOrEqual(1);
      expect(result.content).not.toContain('bad-provider');
      expect(stderrSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
    });

    it('should return changed=true on first run vs empty content', () => {
      const result = main({
        extraDirs: [],
        outPath: path.join(repoRoot, '.tmp-catalog-test-1.md'),
        dryRun: false,
      });
      expect(result.changed).toBe(true);
      fs.unlinkSync(result.outputPath);
    });

    it('should return changed=false on identical re-run', () => {
      const testPath = path.join(repoRoot, '.tmp-catalog-test-2.md');
      const result1 = main({
        extraDirs: [],
        outPath: testPath,
        dryRun: false,
      });
      expect(result1.changed).toBe(true);

      const result2 = main({
        extraDirs: [],
        outPath: testPath,
        dryRun: false,
      });
      expect(result2.changed).toBe(false);
      expect(result1.content).toBe(result2.content);

      fs.unlinkSync(testPath);
    });
  });

  describe('CLI', () => {
    it('should run without --extra flag and generate output', () => {
      const testOutput = path.join(repoRoot, '.tmp-catalog-cli-test.md');
      execSync(`node scripts/generate-catalog.js --out ${testOutput}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      expect(fs.existsSync(testOutput)).toBe(true);
      const content = fs.readFileSync(testOutput, 'utf8');
      expect(content).toContain('Provider Catalog');
      expect(content).toContain('Planned Providers');
      fs.unlinkSync(testOutput);
    });

    it('should use --extra flag to include fixture providers', () => {
      const testOutput = path.join(repoRoot, '.tmp-catalog-cli-extra-test.md');
      execSync(`node scripts/generate-catalog.js --extra ${fixturesDir} --out ${testOutput}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      expect(fs.existsSync(testOutput)).toBe(true);
      const content = fs.readFileSync(testOutput, 'utf8');
      expect(content).toContain('Supabase');
      fs.unlinkSync(testOutput);
    });

    it('should support --check flag and exit 0 when up to date', () => {
      const testOutput = path.join(repoRoot, '.tmp-catalog-check-test.md');
      // First generate
      execSync(`node scripts/generate-catalog.js --out ${testOutput}`, {
        cwd: repoRoot,
        stdio: 'pipe',
      });
      // Then check (should exit 0)
      expect(() => {
        execSync(`node scripts/generate-catalog.js --out ${testOutput} --check`, {
          cwd: repoRoot,
          stdio: 'pipe',
        });
      }).not.toThrow();
      fs.unlinkSync(testOutput);
    });

    it('should support --check flag and exit 1 when out of date', () => {
      const testOutput = path.join(repoRoot, '.tmp-catalog-check-fail-test.md');
      // Generate initial file
      fs.writeFileSync(testOutput, 'old content', 'utf8');
      // Check should fail (file is out of date)
      expect(() => {
        execSync(`node scripts/generate-catalog.js --out ${testOutput} --check`, {
          cwd: repoRoot,
          stdio: 'pipe',
        });
      }).toThrow();
      fs.unlinkSync(testOutput);
    });
  });

  describe('determinism', () => {
    it('should produce byte-identical output on two consecutive runs', () => {
      const result1 = main({
        extraDirs: [fixturesDir],
        outPath: catalogPath,
        dryRun: true,
      });
      const result2 = main({
        extraDirs: [fixturesDir],
        outPath: catalogPath,
        dryRun: true,
      });
      expect(result1.content).toBe(result2.content);
    });
  });

  describe('export constants', () => {
    it('should have CERTIFIED as an array', () => {
      expect(Array.isArray(CERTIFIED)).toBe(true);
    });

    it('should have all 6 roadmap providers in CERTIFIED', () => {
      expect(CERTIFIED.length).toBe(6);
      expect(CERTIFIED).toContain('@minder/provider-supabase');
      expect(CERTIFIED).toContain('@minder/provider-stripe');
      expect(CERTIFIED).toContain('@minder/provider-clerk');
      expect(CERTIFIED).toContain('@minder/provider-firebase');
      expect(CERTIFIED).toContain('@minder/provider-razorpay');
      expect(CERTIFIED).toContain('@minder/provider-sentry');
    });

    it('should have an empty PLANNED array — the initial roadmap is complete', () => {
      expect(Array.isArray(PLANNED)).toBe(true);
      expect(PLANNED.length).toBe(0);
      // Supabase (S-03), Stripe (T-03), Clerk (D-03), Firebase (E-03),
      // Razorpay (F-R1), and Sentry (F-S1) all graduated to CERTIFIED — none
      // are planned any longer.
      expect(PLANNED).toEqual([]);
    });
  });
});
