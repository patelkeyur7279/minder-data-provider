/**
 * MDPD-34: configureMinder() crashed at boot on iOS/Hermes.
 *
 * On Hermes, React Native's setUpGlobals gives `global.window = global` and a
 * `navigator` that has `product: 'ReactNative'` but NO `userAgent`. Platform
 * detection runs isElectron() BEFORE isReactNative(), and isElectron() called
 * `navigator.userAgent.includes('Electron')` bare — throwing
 * `TypeError: Cannot read property 'includes' of undefined` before RN
 * detection could short-circuit. Observed on a real iPhone 16 Pro simulator
 * (iOS 18.4) in 2 of 3 cold launches; evidence in the MDPD workspace
 * (docs/evidence/mdpd-expo-relaunch2.png).
 *
 * jsdom cannot catch this (it always provides a full userAgent), so this test
 * reproduces the exact Hermes global shape.
 */

describe('MDPD-34 — Hermes-realistic globals must not crash platform detection', () => {
  const g = globalThis as any;
  let savedWindow: unknown;
  let savedNavigator: PropertyDescriptor | undefined;
  let savedDocument: PropertyDescriptor | undefined;

  beforeEach(() => {
    jest.resetModules();
    savedWindow = g.window;
    savedNavigator = Object.getOwnPropertyDescriptor(g, 'navigator');
    savedDocument = Object.getOwnPropertyDescriptor(g, 'document');
    // Hermes/RN shape: window IS the global, navigator has product but NO
    // userAgent, and there is no document at all.
    g.window = g;
    Object.defineProperty(g, 'navigator', {
      value: { product: 'ReactNative' },
      configurable: true,
      writable: true,
    });
    delete g.document;
  });

  afterEach(() => {
    g.window = savedWindow;
    if (savedNavigator) Object.defineProperty(g, 'navigator', savedNavigator);
    if (savedDocument) Object.defineProperty(g, 'document', savedDocument);
    jest.resetModules();
  });

  it('PlatformDetector.detect() does not throw and identifies react-native', () => {
    const { PlatformDetector } = require('../src/platform/PlatformDetector');
    PlatformDetector.reset?.();
    let platform: string | undefined;
    expect(() => {
      platform = PlatformDetector.detect();
    }).not.toThrow();
    expect(String(platform)).toMatch(/native|expo/i);
  });

  it('configureMinder({ apiUrl }) does not throw on Hermes-shaped globals', () => {
    const { configureMinder } = require('../src/config/index');
    expect(() => configureMinder({ apiUrl: 'http://localhost:4100' })).not.toThrow();
  });
});
