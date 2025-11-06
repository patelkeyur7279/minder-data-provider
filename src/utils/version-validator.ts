/**
 * Runtime Version Validator
 * 
 * This module automatically detects and warns about React version conflicts
 * at runtime when the package is imported.
 */

import { Logger, LogLevel } from './Logger.js';

const logger = new Logger('VersionValidator', {
  level: process.env.NODE_ENV === 'development' ? LogLevel.WARN : LogLevel.ERROR
});

// Type declarations for runtime React detection
declare global {
  interface Window {
    React?: { version: string };
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: {
      renderers?: Map<number, { version?: string }>;
    };
  }
}

// Type for dynamic require (Node.js environment)
declare const require: ((id: string) => { version?: string }) | undefined;

let hasChecked = false;

export function checkReactVersionAtRuntime(): void {
  // Only check once
  if (hasChecked) return;
  hasChecked = true;

  try {
    // Check if React is available in browser environment
    if (typeof window !== 'undefined' && window.React) {
      const reactVersions: Set<string> = new Set();
      
      const currentReactVersion = window.React.version;
      reactVersions.add(currentReactVersion);

      // Check if there are multiple React instances via DevTools hook
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook.renderers) {
          hook.renderers.forEach((renderer: any) => {
            if (renderer.version) {
              reactVersions.add(renderer.version);
            }
          });
        }
      }

      if (reactVersions.size > 1) {
        logger.error('⚠️ Multiple React versions detected!');
        logger.error('Detected versions:', Array.from(reactVersions));
        logger.error('\n🔧 To fix this issue:');
        logger.error('1. Check your package.json - React should be in peerDependencies only');
        logger.error('2. Remove React from node_modules: rm -rf node_modules/react*');
        logger.error('3. Run: npm run fix-versions (if using minder-data-provider)');
        logger.error('4. Reinstall: npm install\n');
      }
    }

    // Check React vs ReactDOM version match in Node.js environment
    if (typeof require !== 'undefined') {
      try {
        const React = require('react');
        const ReactDOM = require('react-dom');
        
        if (React.version && ReactDOM.version && React.version !== ReactDOM.version) {
          logger.warn(`⚠️ React (${React.version}) and ReactDOM (${ReactDOM.version}) version mismatch!`);
          logger.warn('This may cause unexpected issues. Please ensure versions match.');
        }
      } catch (e) {
        // SSR or module not available, skip check
      }
    }

  } catch (error) {
    // Silently fail - don't break the app
    if (process.env.NODE_ENV === 'development') {
      logger.warn('Could not perform React version check:', error);
    }
  }
}

// Auto-check in development
if (process.env.NODE_ENV === 'development') {
  // Defer check to avoid blocking
  if (typeof setTimeout !== 'undefined') {
    setTimeout(() => {
      checkReactVersionAtRuntime();
    }, 100);
  }
}
