import { useMinderContext } from '../core/MinderDataProvider.js';
import type { DebugLogEntry } from './DebugManager.js';
import { DebugLogType } from '../constants/enums.js';

export function useDebug() {
  const { debugManager } = useMinderContext();

  return {
    log: (type: DebugLogType, message: string, data?: unknown) => 
      debugManager?.log(type, message, data),
    startTimer: (key: string) => debugManager?.startTimer(key),
    endTimer: (key: string) => debugManager?.endTimer(key),
    getLogs: (): DebugLogEntry[] => debugManager?.getLogs() || [],
    clearLogs: () => debugManager?.clearLogs(),
    getPerformanceMetrics: (): [string, number][] => debugManager?.getPerformanceMetrics() || []
  };
}