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
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-gray-200/50 shadow-lg shadow-gray-200/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 shadow-lg shadow-blue-500/50">
              <span className="text-white text-lg font-black">M</span>
              <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl opacity-0 group-hover:opacity-100 blur transition-all"></div>
            </div>
            <div className="hidden md:block">
              <span className="text-xl font-black bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                Minder
              </span>
              <div className="text-xs text-gray-500 font-medium -mt-1">Data Provider</div>
            </div>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1 bg-gray-100/60 rounded-xl p-1.5">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
                    ${
                      isActive
                        ? 'bg-white text-blue-700 shadow-md shadow-blue-100'
                        : 'text-gray-600 hover:bg-white/60 hover:text-gray-900'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.name}</span>
                </Link>
              );
            })}
          </div>

          {/* Status Badge */}
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-green-500/30">
            <div className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </div>
            <span>LIVE DEMO</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
