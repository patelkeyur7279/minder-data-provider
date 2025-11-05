'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TrendingUp, TrendingDown, Database, Clock } from 'lucide-react';

export function CacheStats() {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const queries = queryCache.getAll();

  const stats = {
    total: queries.length,
    fresh: queries.filter((q) => q.state.status === 'success' && !q.isStale()).length,
    stale: queries.filter((q) => q.isStale()).length,
    loading: queries.filter((q) => q.state.status === 'pending').length,
    error: queries.filter((q) => q.state.status === 'error').length,
  };

  const memoryEstimate = queries.reduce((acc, query) => {
    const dataStr = JSON.stringify(query.state.data || {});
    return acc + new Blob([dataStr]).size;
  }, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache Statistics</CardTitle>
        <CardDescription>
          Real-time overview of React Query cache state
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Total Queries</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
          </div>

          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Fresh</span>
            </div>
            <p className="text-2xl font-bold text-green-600">{stats.fresh}</p>
          </div>

          <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Stale</span>
            </div>
            <p className="text-2xl font-bold text-orange-600">{stats.stale}</p>
          </div>

          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-slate-600 dark:text-slate-400">Loading</span>
            </div>
            <p className="text-2xl font-bold text-purple-600">{stats.loading}</p>
          </div>
        </div>

        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600 dark:text-slate-400">Estimated Memory</span>
            <Badge variant="secondary">
              {(memoryEstimate / 1024).toFixed(2)} KB
            </Badge>
          </div>
        </div>

        {stats.error > 0 && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-600 dark:text-red-400">Queries with Errors</span>
              <Badge variant="destructive">{stats.error}</Badge>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
