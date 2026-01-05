import { useState, useEffect } from 'react';
import { useMinderContext } from '../core/MinderDataProvider.js';

export function useEnvironment() {
  const { environmentManager } = useMinderContext();
  const [isMounted, setIsMounted] = useState(false);
  const [env, setEnv] = useState(
    environmentManager ? environmentManager.getCurrentEnvironment() : 'single'
  );

  useEffect(() => {
    setIsMounted(true);
    if (environmentManager) {
      setEnv(environmentManager.getCurrentEnvironment());
    }
  }, [environmentManager]);

  if (!environmentManager) {
    return {
      currentEnvironment: 'single',
      setEnvironment: () => { },
      getAllEnvironments: () => ['single'],
      isProduction: () => false,
      isDevelopment: () => true,
      getDebugMode: () => false,
      getEnvironmentConfig: () => null,
      isHydrated: true,
    };
  }

  // During SSR/initial render, we might want to be careful.
  // But returning the manager's value is usually what we want, 
  // unless it differs on server/client.
  // To be 100% safe against hydration mismatch, we should return a stable value initially
  // if we suspect mismatch.
  // However, forcing a double render for everyone might be annoying.
  // Let's expose isHydrated so users can handle it if needed.

  return {
    currentEnvironment: isMounted ? environmentManager.getCurrentEnvironment() : env,
    setEnvironment: (env: string) => {
      environmentManager.setEnvironment(env);
      setEnv(env);
    },
    getAllEnvironments: () => environmentManager.getAllEnvironments(),
    isProduction: () => environmentManager.isProduction(),
    isDevelopment: () => environmentManager.isDevelopment(),
    getDebugMode: () => environmentManager.getDebugMode(),
    getEnvironmentConfig: () => environmentManager.getEnvironmentOverride(),
    isHydrated: isMounted,
  };
}

export function useProxy() {
  const { proxyManager } = useMinderContext();

  if (!proxyManager) {
    return {
      isEnabled: () => false,
      generateNextJSProxy: () => '',
    };
  }

  return {
    isEnabled: () => proxyManager.isEnabled(),
    generateNextJSProxy: () => proxyManager.generateNextJSProxy(),
  };
}