import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

/**
 * Layout Component - Shared wrapper for all pages
 * 
 * Why use a layout?
 * - Consistent header/footer
 * - Shared navigation
 * - Common meta tags
 * - DRY principle
 */

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

export default function Layout({
  children,
  title = 'Minder Blog',
  description = 'Blog example demonstrating SSR, SSG, and ISR with Minder',
}: LayoutProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="layout">
        <header className="header">
          <div className="container">
            <Link href="/" className="logo">
              📝 Minder Blog
            </Link>
            <nav className="nav">
              <Link href="/">Home</Link>
              <a href="https://github.com/yourusername/minder" target="_blank" rel="noopener">
                GitHub
              </a>
            </nav>
          </div>
        </header>

        <main className="main">{children}</main>

        <footer className="footer">
          <div className="container">
            <p>
              Built with <strong>Minder Data Provider</strong> and Next.js
            </p>
            <p className="features">
              Demonstrating SSG • SSR • ISR
            </p>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .layout {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        .header {
          background: white;
          border-bottom: 1px solid #e5e7eb;
          padding: 1rem 0;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-size: 1.25rem;
          font-weight: 700;
          text-decoration: none;
          color: #111827;
        }

        .nav {
          display: flex;
          gap: 1.5rem;
        }

        .nav :global(a) {
          color: #666;
          text-decoration: none;
          transition: color 0.2s;
        }

        .nav :global(a:hover) {
          color: #4f46e5;
        }

        .main {
          flex: 1;
          background: #f9fafb;
        }

        .footer {
          background: white;
          border-top: 1px solid #e5e7eb;
          padding: 2rem 0;
          margin-top: auto;
        }

        .footer .container {
          flex-direction: column;
          text-align: center;
          gap: 0.5rem;
        }

        .footer p {
          color: #666;
          margin: 0;
        }

        .features {
          font-size: 0.875rem;
          color: #999;
        }
      `}</style>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
            Oxygen, Ubuntu, Cantarell, sans-serif;
          color: #111827;
          background: #f9fafb;
        }
      `}</style>
    </>
  );
}
