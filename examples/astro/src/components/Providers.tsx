// Client providers: TanStack QueryClientProvider + MinderDataProvider.
// Mirrors examples/nextjs-app-router/app/providers.tsx.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MinderDataProvider } from 'minder-data-provider';
import { minderConfig } from '../lib/minder-config';

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MinderDataProvider config={minderConfig}>{children}</MinderDataProvider>
    </QueryClientProvider>
  );
}
