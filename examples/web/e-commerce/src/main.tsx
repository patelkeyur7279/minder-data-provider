import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './utils/api'; // Initialize API configuration
import './index.css';

/**
 * Main Entry Point
 * 
 * Sets up:
 * - React Query (required by useMinder)
 * - API configuration (imported from utils/api)
 * - Root app component
 * 
 * Why this setup?
 * - QueryClientProvider enables useMinder() to work
 * - Single entry point, clean initialization
 * - API config runs once on startup
 */

// Create QueryClient for React Query
// Why? useMinder() uses React Query under the hood
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
      // Retry failed requests
      retry: 1,
      // Cache time: 5 minutes
      gcTime: 5 * 60 * 1000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* 
      QueryClientProvider required for useMinder()
      Why? Provides caching, deduplication, background updates
    */}
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
