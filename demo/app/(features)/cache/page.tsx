'use client';

import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { CacheStrategySelector } from '@/features/cache/components/CacheStrategySelector';
import { CacheStats } from '@/features/cache/components/CacheStats';
import { CacheInvalidation } from '@/features/cache/components/CacheInvalidation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { usePosts } from '@/features/crud/hooks/usePosts';
import { Database, Zap, Clock, RefreshCw } from 'lucide-react';

type CacheStrategy = 'stale-while-revalidate' | 'cache-first' | 'network-first' | 'cache-only';

export default function CachePage() {
  const [strategy, setStrategy] = useState<CacheStrategy>('stale-while-revalidate');
  const [staleTime, setStaleTime] = useState(30000); // 30 seconds

  // Example query to demonstrate caching
  const { data, isLoading, isFetching, dataUpdatedAt, refetch } = usePosts({
    page: 1,
    limit: 5,
  });

  const timeSinceUpdate = Date.now() - dataUpdatedAt;
  const isStale = timeSinceUpdate > staleTime;

  return (
    <MainLayout>
      <div className="container mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
            Cache Management
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Intelligent caching with React Query. Automatic cache invalidation, stale-while-revalidate,
            and manual cache control for optimal performance.
          </p>
        </div>

        {/* Feature Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Zap className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Strategy</p>
                  <p className="font-semibold">Configurable</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <Database className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Auto Invalidation</p>
                  <p className="font-semibold">Enabled</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Stale Time</p>
                  <p className="font-semibold">{staleTime / 1000}s</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Background Refetch</p>
                  <p className="font-semibold">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cache Strategy Selector */}
        <div className="mb-6">
          <CacheStrategySelector
            selectedStrategy={strategy}
            onStrategyChange={setStrategy}
          />
        </div>

        {/* Live Demo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Live Cache Demo</CardTitle>
            <CardDescription>
              Real-time demonstration of caching behavior with posts data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Button onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                  Refetch Data
                </Button>
                <div className="flex items-center gap-2">
                  <Badge variant={isStale ? 'destructive' : 'default'}>
                    {isStale ? 'Stale' : 'Fresh'}
                  </Badge>
                  {isFetching && <Badge variant="secondary">Fetching...</Badge>}
                  {isLoading && <Badge variant="secondary">Loading...</Badge>}
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Last Updated:</span>
                  <span className="font-medium">
                    {new Date(dataUpdatedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Time Since Update:</span>
                  <span className="font-medium">
                    {(timeSinceUpdate / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Posts Cached:</span>
                  <span className="font-medium">
                    {data?.data?.length || 0}
                  </span>
                </div>
              </div>

              {data?.data && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <div className="max-h-48 overflow-y-auto">
                    {data.data.slice(0, 3).map((post) => (
                      <div
                        key={post.id}
                        className="p-3 border-b border-slate-200 dark:border-slate-800 last:border-0"
                      >
                        <p className="font-medium text-sm">{post.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          ID: {post.id}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cache Statistics */}
        <div className="mb-6">
          <CacheStats />
        </div>

        {/* Cache Invalidation Controls */}
        <div>
          <CacheInvalidation />
        </div>
      </div>
    </MainLayout>
  );
}
