import { useMinderContext } from '../core/MinderDataProvider.js';

export function useDebug() {
  const { debugManager } = useMinderContext();

  return {
    log: (type: 'api' | 'cache' | 'auth' | 'websocket', message: string, data?: any) => 
      debugManager?.log(type, message, data),
    startTimer: (key: string) => debugManager?.startTimer(key),
    endTimer: (key: string) => debugManager?.endTimer(key),
    getLogs: () => debugManager?.getLogs() || [],
    clearLogs: () => debugManager?.clearLogs(),
    getPerformanceMetrics: () => debugManager?.getPerformanceMetrics() || []
  };
}