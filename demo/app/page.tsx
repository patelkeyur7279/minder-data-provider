import Link from 'next/link';
import { ArrowRight, Sparkles, Zap, Shield, Code2, Rocket, Star } from 'lucide-react';

const features = [
  {
    title: 'CRUD Operations',
    description: 'Complete data management with pagination, search, filters, and real-time updates',
    href: '/crud',
    icon: '🗄️',
    gradient: 'from-blue-500 via-blue-600 to-cyan-500',
    useCase: 'E-commerce, SaaS, CMS',
    badge: 'Popular'
  },
  {
    title: 'Authentication',
    description: 'JWT-based auth with token refresh, session management, and role-based access',
    href: '/auth',
    icon: '🔐',
    gradient: 'from-purple-500 via-purple-600 to-pink-500',
    useCase: 'Enterprise, SaaS',
    badge: 'Essential'
  },
  {
    title: 'Smart Caching',
    description: 'Multi-strategy caching with TTL, invalidation, and performance metrics',
    href: '/cache',
    icon: '⚡',
    gradient: 'from-yellow-500 via-orange-500 to-red-500',
    useCase: 'News, Analytics',
    badge: 'Fast'
  },
  {
    title: 'Real-time WebSocket',
    description: 'Live chat, presence, typing indicators, and data synchronization',
    href: '/chat',
    icon: '💬',
    gradient: 'from-green-500 via-emerald-500 to-teal-500',
    useCase: 'Chat, Collaboration',
    badge: 'Real-time'
  },
  {
    title: 'File Upload',
    description: 'Drag-drop, multi-file, progress tracking, image preview & cropping',
    href: '/upload',
    icon: '📁',
    gradient: 'from-indigo-500 via-blue-500 to-purple-500',
    useCase: 'Media, Documents',
    badge: 'Enhanced'
  },
  {
    title: 'Offline Support',
    description: 'Network detection, offline queue, auto-sync, and conflict resolution',
    href: '/offline',
    icon: '📡',
    gradient: 'from-red-500 via-rose-500 to-pink-500',
    useCase: 'PWA, Mobile Apps',
    badge: 'Reliable'
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/30">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600">
        {/* Animated background */}
        <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:60px_60px]"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
        
        <div className="container mx-auto px-4 py-24 relative">
          <div className="text-center max-w-5xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-full mb-8 hover:bg-white/30 transition-all duration-300">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span className="text-sm font-bold text-white">
                v2.1 - Production Ready 🎉
              </span>
            </div>
            
            {/* Main Heading */}
            <h1 className="text-6xl md:text-7xl font-black mb-6 text-white leading-tight">
              Minder Data Provider
            </h1>
            
            <p className="text-xl md:text-2xl text-blue-100 mb-4 font-medium">
              The ultimate React data management solution
            </p>
            
            <p className="text-lg text-white/90 mb-12 max-w-3xl mx-auto">
              <span className="font-bold bg-white/20 px-3 py-1 rounded-lg">10 powerful features</span>
              {' '} • {' '}
              <span className="font-bold bg-white/20 px-3 py-1 rounded-lg">Type-safe</span>
              {' '} • {' '}
              <span className="font-bold bg-white/20 px-3 py-1 rounded-lg">Production ready</span>
            </p>
            
            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
              <Link 
                href="/crud"
                className="group px-8 py-4 bg-white text-blue-600 rounded-xl font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 flex items-center gap-2"
              >
                <Rocket className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a 
                href="https://github.com/patelkeyur7279/minder-data-provider"
                target="_blank"
                rel="noopener noreferrer"
                className="group px-8 py-4 bg-white/10 backdrop-blur-md text-white border-2 border-white/30 rounded-xl font-bold text-lg hover:bg-white/20 hover:shadow-2xl hover:scale-105 transition-all duration-300 flex items-center gap-2"
              >
                <Star className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                View on GitHub
              </a>
            </div>

            {/* Tech Stack Icons */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-white/90">
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20">
                <Code2 className="w-4 h-4 text-blue-200" />
                <span className="font-semibold">TypeScript</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20">
                <Zap className="w-4 h-4 text-yellow-200" />
                <span className="font-semibold">React 19</span>
              </div>
              <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-lg border border-white/20">
                <Shield className="w-4 h-4 text-green-200" />
                <span className="font-semibold">Next.js 16</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-bold mb-4">
            ✨ COMPREHENSIVE FEATURES
          </div>
          <h2 className="text-5xl font-black mb-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            All Features in One Place
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Explore comprehensive demos for every feature across multiple real-world use cases
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {features.map((feature, index) => (
            <Link
              key={feature.href}
              href={feature.href}
              className="group relative bg-white rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-transparent overflow-hidden hover:-translate-y-2 animate-fade-in-up"
              style={{
                animationDelay: `${index * 0.1}s`,
              }}
            >
              {/* Gradient background on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-all duration-500`}></div>
              
              {/* Badge */}
              {feature.badge && (
                <div className="absolute top-4 right-4 px-3 py-1 bg-gradient-to-r from-yellow-400 to-orange-400 text-white text-xs font-bold rounded-full shadow-lg">
                  {feature.badge}
                </div>
              )}
              
              <div className="relative">
                {/* Icon */}
                <div className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 shadow-xl`}>
                  <span className="text-3xl">{feature.icon}</span>
                </div>
                
                {/* Title */}
                <h3 className="text-2xl font-bold mb-3 text-gray-800 group-hover:text-blue-600 transition-colors">
                  {feature.title}
                </h3>
                
                {/* Description */}
                <p className="text-gray-600 mb-6 leading-relaxed">
                  {feature.description}
                </p>
                
                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold px-4 py-2 bg-gray-100 text-gray-600 rounded-lg group-hover:bg-gradient-to-r group-hover:from-blue-100 group-hover:to-purple-100 group-hover:text-blue-700 transition-all">
                    {feature.useCase}
                  </span>
                  <span className="flex items-center gap-2 text-blue-600 font-bold group-hover:gap-3 transition-all">
                    Explore
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="relative bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-3xl p-16 text-white text-center overflow-hidden shadow-2xl">
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:60px_60px]"></div>
          <div className="relative">
            <h2 className="text-4xl md:text-5xl font-black mb-12">Production Ready for Any Use Case</h2>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                <div className="text-5xl font-black mb-2 bg-white/90 bg-clip-text text-transparent">10</div>
                <div className="text-blue-100 font-semibold">Features</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                <div className="text-5xl font-black mb-2 bg-white/90 bg-clip-text text-transparent">50+</div>
                <div className="text-blue-100 font-semibold">Examples</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                <div className="text-5xl font-black mb-2 bg-white/90 bg-clip-text text-transparent">100%</div>
                <div className="text-blue-100 font-semibold">TypeScript</div>
              </div>
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                <div className="text-5xl font-black mb-2 bg-white/90 bg-clip-text text-transparent">∞</div>
                <div className="text-blue-100 font-semibold">Possibilities</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-600 mb-6 text-lg">
            Built with <span className="text-red-500 text-xl">❤️</span> by the Minder team
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <a href="https://github.com/patelkeyur7279/minder-data-provider" className="text-gray-600 hover:text-blue-600 font-semibold transition-colors">
              GitHub
            </a>
            <a href="/docs" className="text-gray-600 hover:text-blue-600 font-semibold transition-colors">
              Documentation
            </a>
            <a href="/examples" className="text-gray-600 hover:text-blue-600 font-semibold transition-colors">
              Examples
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
