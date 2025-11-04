import Link from 'next/link';
import { 
  DatabaseIcon, 
  LockKeyholeIcon, 
  ZapIcon, 
  WifiIcon, 
  UploadIcon, 
  WifiOffIcon,
  GaugeIcon,
  ShieldCheckIcon,
  ServerIcon,
  MonitorSmartphoneIcon
} from 'lucide-react';

const features = [
  {
    title: 'CRUD Operations',
    description: 'Complete data management with pagination, search, filters, and real-time updates',
    icon: DatabaseIcon,
    href: '/crud',
    color: 'bg-blue-500',
    gradient: 'from-blue-500 to-cyan-500',
    useCase: 'E-commerce, SaaS, CMS'
  },
  {
    title: 'Authentication',
    description: 'JWT-based auth with token refresh, session management, and role-based access',
    icon: LockKeyholeIcon,
    href: '/auth',
    color: 'bg-purple-500',
    gradient: 'from-purple-500 to-pink-500',
    useCase: 'Enterprise, SaaS'
  },
  {
    title: 'Smart Caching',
    description: 'Multi-strategy caching with TTL, invalidation, and performance metrics',
    icon: ZapIcon,
    href: '/cache',
    color: 'bg-yellow-500',
    gradient: 'from-yellow-500 to-orange-500',
    useCase: 'News, Analytics'
  },
  {
    title: 'Real-time WebSocket',
    description: 'Live chat, presence, typing indicators, and data synchronization',
    icon: WifiIcon,
    href: '/websocket',
    color: 'bg-green-500',
    gradient: 'from-green-500 to-emerald-500',
    useCase: 'Chat, Collaboration'
  },
  {
    title: 'File Upload',
    description: 'Drag-drop, multi-file, progress tracking, image preview & cropping',
    icon: UploadIcon,
    href: '/upload',
    color: 'bg-indigo-500',
    gradient: 'from-indigo-500 to-blue-500',
    useCase: 'Media, Documents'
  },
  {
    title: 'Offline Support',
    description: 'Network detection, offline queue, auto-sync, and conflict resolution',
    icon: WifiOffIcon,
    href: '/offline',
    color: 'bg-red-500',
    gradient: 'from-red-500 to-rose-500',
    useCase: 'PWA, Mobile Apps'
  },
  {
    title: 'Performance',
    description: 'Request monitoring, response time tracking, and optimization insights',
    icon: GaugeIcon,
    href: '/performance',
    color: 'bg-teal-500',
    gradient: 'from-teal-500 to-cyan-500',
    useCase: 'Dashboards, Analytics'
  },
  {
    title: 'Security',
    description: 'CSRF protection, XSS prevention, rate limiting, and secure headers',
    icon: ShieldCheckIcon,
    href: '/security',
    color: 'bg-orange-500',
    gradient: 'from-orange-500 to-red-500',
    useCase: 'Finance, Healthcare'
  },
  {
    title: 'SSR/CSR/SSG',
    description: 'Server-side rendering, client-side rendering, and static generation',
    icon: ServerIcon,
    href: '/ssr',
    color: 'bg-slate-500',
    gradient: 'from-slate-500 to-gray-500',
    useCase: 'SEO, Performance'
  },
  {
    title: 'Platform Detection',
    description: 'Automatic optimization for Web, React Native, Electron, and more',
    icon: MonitorSmartphoneIcon,
    href: '/platform',
    color: 'bg-violet-500',
    gradient: 'from-violet-500 to-purple-500',
    useCase: 'Cross-platform'
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="container mx-auto px-4 py-20 relative">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-full mb-8 animate-slide-in">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
              </span>
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                v2.1 - Production Ready
              </span>
            </div>
            
            <h1 className="text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent animate-fade-in">
              Minder Data Provider
            </h1>
            
            <p className="text-xl text-slate-600 dark:text-slate-400 mb-8 animate-slide-up">
              The ultimate React data management solution. 
              <br />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                10 powerful features. Infinite possibilities.
              </span>
            </p>
            
            <div className="flex items-center justify-center gap-4 mb-12 animate-slide-up">
              <Link 
                href="/crud"
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all"
              >
                Get Started
              </Link>
              <a 
                href="https://github.com/patelkeyur7279/minder-data-provider"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all"
              >
                View on GitHub
              </a>
            </div>

            <div className="flex items-center justify-center gap-8 text-sm text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>TypeScript</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>React 18+</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Next.js 14</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-slate-800 dark:text-white">
            All Features in One Place
          </h2>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Explore comprehensive demos for every feature across multiple use cases
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.href}
                href={feature.href}
                className="group relative bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-2xl hover:scale-105 transition-all duration-300 overflow-hidden"
                style={{
                  animationDelay: `${index * 50}ms`,
                }}
              >
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                
                <div className="relative">
                  <div className={`w-12 h-12 ${feature.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  
                  <h3 className="text-xl font-bold mb-2 text-slate-800 dark:text-white">
                    {feature.title}
                  </h3>
                  
                  <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">
                    {feature.description}
                  </p>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-full">
                      {feature.useCase}
                    </span>
                    <span className="text-blue-600 dark:text-blue-400 text-sm font-medium group-hover:translate-x-1 transition-transform">
                      Explore →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-12 text-white text-center">
          <h2 className="text-3xl font-bold mb-8">Production Ready for Any Use Case</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <div className="text-4xl font-bold mb-2">10</div>
              <div className="text-blue-100">Features</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">50+</div>
              <div className="text-blue-100">Examples</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">100%</div>
              <div className="text-blue-100">TypeScript</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">∞</div>
              <div className="text-blue-100">Possibilities</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-12">
        <div className="container mx-auto px-4 text-center text-slate-600 dark:text-slate-400">
          <p className="mb-4">
            Built with ❤️ by the Minder team
          </p>
          <div className="flex items-center justify-center gap-6">
            <a href="https://github.com/patelkeyur7279/minder-data-provider" className="hover:text-blue-600 transition-colors">
              GitHub
            </a>
            <a href="/docs" className="hover:text-blue-600 transition-colors">
              Documentation
            </a>
            <a href="/examples" className="hover:text-blue-600 transition-colors">
              Examples
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
