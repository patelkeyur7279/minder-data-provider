'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Trash2, RefreshCw, Database } from 'lucide-react';

export function CacheInvalidation() {
  const queryClient = useQueryClient();
  const queryCache = queryClient.getQueryCache();
  const queries = queryCache.getAll();

  const handleInvalidateAll = () => {
    queryClient.invalidateQueries();
  };

  const handleInvalidateQuery = (queryKey: any) => {
    queryClient.invalidateQueries({ queryKey });
  };

  const handleClearAll = () => {
    queryClient.clear();
  };

  const handleRemoveQuery = (queryKey: any) => {
    queryClient.removeQueries({ queryKey });
  };

  // Group queries by their first key
  const groupedQueries = queries.reduce((acc, query) => {
    const firstKey = Array.isArray(query.queryKey) ? query.queryKey[0] : query.queryKey;
    const keyStr = String(firstKey);
    if (!acc[keyStr]) {
      acc[keyStr] = [];
    }
    acc[keyStr].push(query);
    return acc;
  }, {} as Record<string, typeof queries>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Cache Invalidation</CardTitle>
            <CardDescription>
              Manually invalidate or clear cached queries
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleInvalidateAll}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Invalidate All
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {Object.keys(groupedQueries).length === 0 ? (
          <div className="text-center py-8 text-slate-600 dark:text-slate-400">
            <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No cached queries</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedQueries).map(([key, groupQueries]) => (
              <div
                key={key}
                className="p-3 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{key}</h4>
                    <Badge variant="secondary">{groupQueries.length}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleInvalidateQuery([key])}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Invalidate
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemoveQuery([key])}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {groupQueries.map((query, idx) => (
                    <Badge
                      key={idx}
                      variant={
                        query.state.status === 'success'
                          ? 'default'
                          : query.state.status === 'error'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {query.state.status}
                      {query.isStale() && ' (stale)'}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
