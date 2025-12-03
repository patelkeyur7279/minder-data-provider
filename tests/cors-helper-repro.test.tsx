import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMinder } from '../src/hooks/useMinder';
import { MinderDataProvider, useMinderContext } from '../src/core/MinderDataProvider';
import { MinderConfig } from '../src/core/types';

const createWrapper = (config: MinderConfig) => {
    return ({ children }: { children: React.ReactNode }) => (
        <MinderDataProvider config={config}>
            {children}
        </MinderDataProvider>
    );
};

describe('CORS Helper Verification', () => {
    it('should initialize ProxyManager when using deprecated cors config', () => {
        const config: MinderConfig = {
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            cors: {
                enabled: true,
                proxy: 'https://proxy.example.com'
            }
        };

        const { result } = renderHook(() => useMinderContext(), {
            wrapper: createWrapper(config),
        });

        expect(result.current.proxyManager).toBeDefined();
        expect(result.current.proxyManager?.isEnabled()).toBe(true);
    });

    it('should initialize ProxyManager when using new corsHelper config', () => {
        const config: MinderConfig = {
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            corsHelper: {
                enabled: true,
                proxy: 'https://proxy.example.com'
            }
        };

        const { result } = renderHook(() => useMinderContext(), {
            wrapper: createWrapper(config),
        });

        // This is expected to FAIL currently because MinderDataProvider ignores corsHelper
        expect(result.current.proxyManager).toBeDefined();
        expect(result.current.proxyManager?.isEnabled()).toBe(true);
    });
});
