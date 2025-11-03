import { useMinderContext } from '../core/MinderDataProvider.js';

export function useEnvironment() {
  const { environmentManager } = useMinderContext();

  if (!environmentManager) {
    return {
      currentEnvironment: 'single',
      setEnvironment: () => {},
      getAllEnvironments: () => ['single'],
      isProduction: () => false,
      isDevelopment: () => true,
      getDebugMode: () => false,
      getEnvironmentConfig: () => null,
    };
  }

  return {
    currentEnvironment: environmentManager.getCurrentEnvironment(),
    setEnvironment: (env: string) => environmentManager.setEnvironment(env),
    getAllEnvironments: () => environmentManager.getAllEnvironments(),
    isProduction: () => environmentManager.isProduction(),
    isDevelopment: () => environmentManager.isDevelopment(),
    getDebugMode: () => environmentManager.getDebugMode(),
    getEnvironmentConfig: () => environmentManager.getEnvironmentOverride(),
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