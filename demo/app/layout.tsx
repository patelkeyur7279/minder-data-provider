import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Minder Data Provider - Complete Demo',
  description: 'Comprehensive demonstration of all Minder Data Provider features across multiple use cases',
  keywords: ['React', 'Data Provider', 'CRUD', 'Authentication', 'WebSocket', 'Cache', 'Upload', 'Offline'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
