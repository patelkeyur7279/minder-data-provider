import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

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
      <body className={inter.className}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
