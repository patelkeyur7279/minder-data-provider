import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { NetworkStatus } from '../types';

/**
 * useNetwork Hook
 * 
 * Why separate hook?
 * - Reusable network state
 * - Automatic reconnection detection
 * - Clean component code
 * 
 * Uses @react-native-community/netinfo
 */
export function useNetwork() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown',
  });

  useEffect(() => {
    /**
     * Subscribe to network state changes
     * 
     * Why subscribe?
     * - Real-time network status
     * - Detect when user comes back online
     * - Trigger sync automatically
     */
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    // Get initial network state
    NetInfo.fetch().then((state) => {
      setNetworkStatus({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    return () => unsubscribe();
  }, []);

  return networkStatus;
}
