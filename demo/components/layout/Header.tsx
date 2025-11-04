'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, X, Github } from 'lucide-react';
import { FEATURES } from '@/lib/constants';
import { Button } from '@/components/ui/Button';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  
  const isActive = (path: string) => pathname === path;
  
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg"></div>
          <span className="font-bold text-xl hidden sm:inline-block">Minder</span>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-1">
          <Link
            href="/"
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive('/') 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Home
          </Link>
          <div className="relative group">
            <button className="px-3 py-2 rounded-md text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
              Features
            </button>
            <div className="absolute left-0 mt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-2">
              {FEATURES.map((feature) => (
                <Link
                  key={feature.id}
                  href={feature.route}
                  className={`block px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    isActive(feature.route) ? 'text-blue-600 dark:text-blue-400 font-medium' : ''
                  }`}
                >
                  {feature.name}
                </Link>
              ))}
            </div>
          </div>
          <Link
            href="/examples"
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive('/examples') 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Examples
          </Link>
          <Link
            href="/docs"
            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              isActive('/docs') 
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                : 'hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Docs
          </Link>
        </div>
        
        {/* Right Side Actions */}
        <div className="flex items-center space-x-4">
          <a
            href="https://github.com/patelkeyur7279/minder-data-provider"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-2 text-sm hover:text-blue-600 transition-colors"
          >
            <Github className="w-5 h-5" />
            <span className="hidden lg:inline">GitHub</span>
          </a>
          
          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>
      
      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="container mx-auto px-4 py-4 space-y-2">
            <Link
              href="/"
              className={`block px-3 py-2 rounded-md text-sm font-medium ${
                isActive('/') 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <div className="space-y-1">
              <p className="px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400">
                Features
              </p>
              {FEATURES.map((feature) => (
                <Link
                  key={feature.id}
                  href={feature.route}
                  className={`block px-6 py-2 rounded-md text-sm ${
                    isActive(feature.route) 
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 font-medium' 
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {feature.name}
                </Link>
              ))}
            </div>
            <Link
              href="/examples"
              className={`block px-3 py-2 rounded-md text-sm font-medium ${
                isActive('/examples') 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Examples
            </Link>
            <Link
              href="/docs"
              className={`block px-3 py-2 rounded-md text-sm font-medium ${
                isActive('/docs') 
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300' 
                  : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Docs
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
