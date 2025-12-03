import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MinderDataProvider, useMinderContext } from '../src/core/MinderDataProvider';
import { ProxyManager } from '../src/core/ProxyManager';
import { MinderConfig } from '../src/core/types';

// Test component to access context
const TestComponent = () => {
    const { proxyManager } = useMinderContext();

    if (!proxyManager) return <div>No Proxy Manager</div>;

    return (
        <div>
            <div data-testid="proxy-enabled">{proxyManager.isEnabled().toString()}</div>
            <div data-testid="proxy-base-url">{proxyManager.config.baseUrl}</div>
        </div>
    );
};

describe('Auto-Proxy Configuration', () => {
    it('should default to /api/minder-proxy when corsHelper is enabled but proxy is missing', () => {
        const config = {
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            corsHelper: {
                enabled: true,
                // No proxy URL provided
            }
        } as unknown as MinderConfig;

        render(
            <MinderDataProvider config={config}>
                <TestComponent />
            </MinderDataProvider>
        );

        expect(screen.getByTestId('proxy-enabled')).toHaveTextContent('true');
        expect(screen.getByTestId('proxy-base-url')).toHaveTextContent('/api/minder-proxy');
    });

    it('should use provided proxy URL when specified', () => {
        const config = {
            apiBaseUrl: 'https://api.example.com',
            routes: {},
            corsHelper: {
                enabled: true,
                proxy: '/custom-proxy'
            }
        } as unknown as MinderConfig;

        render(
            <MinderDataProvider config={config}>
                <TestComponent />
            </MinderDataProvider>
        );

        expect(screen.getByTestId('proxy-enabled')).toHaveTextContent('true');
        expect(screen.getByTestId('proxy-base-url')).toHaveTextContent('/custom-proxy');
    });
});
