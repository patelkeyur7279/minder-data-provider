'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Database, Lock, Layers, MessageCircle, Upload, WifiOff, Zap, Shield, Server } from 'lucide-react';

const navigation = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'CRUD', href: '/crud', icon: Database },
  { name: 'Auth', href: '/auth', icon: Lock },
  { name: 'Cache', href: '/cache', icon: Layers },
  { name: 'Chat', href: '/chat', icon: MessageCircle },
  { name: 'Upload', href: '/upload', icon: Upload },
  { name: 'Offline', href: '/offline', icon: WifiOff },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-xl text-gray-900 hover:text-blue-600 transition-colors">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">M</span>
            </div>
            <span className="hidden md:inline">Minder Demo</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Status Badge */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Live Demo</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
