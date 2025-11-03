import type { AppProps } from 'next/app';
import { MinderDataProvider } from '../../src/core/MinderDataProvider.js';
import { completeConfig } from '../features/01-configuration.js';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <MinderDataProvider config={completeConfig}>
      <Component {...pageProps} />
    </MinderDataProvider>
  );
}