'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Clock, Zap, Database, RefreshCw } from 'lucide-react';

type CacheStrategy = 'stale-while-revalidate' | 'cache-first' | 'network-first' | 'cache-only';

interface CacheStrategyOption {
  id: CacheStrategy;
  name: string;
  description: string;
  icon: React.ReactNode;
  useCase: string;
}

const strategies: CacheStrategyOption[] = [
  {
    id: 'stale-while-revalidate',
    name: 'Stale While Revalidate',
    description: 'Return cached data immediately, fetch fresh data in background',
    icon: <Zap className="w-5 h-5" />,
    useCase: 'Best for: Real-time feeds, frequently changing data',
  },
  {
    id: 'cache-first',
    name: 'Cache First',
    description: 'Use cached data if available, only fetch if missing',
    icon: <Database className="w-5 h-5" />,
    useCase: 'Best for: Static content, rarely changing data',
  },
  {
    id: 'network-first',
    name: 'Network First',
    description: 'Always fetch fresh data, fallback to cache on error',
    icon: <RefreshCw className="w-5 h-5" />,
    useCase: 'Best for: Critical data that must be fresh',
  },
  {
    id: 'cache-only',
    name: 'Cache Only',
    description: 'Never fetch, only use cached data',
    icon: <Clock className="w-5 h-5" />,
    useCase: 'Best for: Offline mode, pre-fetched data',
  },
];

interface CacheStrategySelectorProps {
  selectedStrategy: CacheStrategy;
  onStrategyChange: (strategy: CacheStrategy) => void;
}

export function CacheStrategySelector({ selectedStrategy, onStrategyChange }: CacheStrategySelectorProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache Strategies</CardTitle>
        <CardDescription>
          Choose how data should be fetched and cached
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              onClick={() => onStrategyChange(strategy.id)}
              className={`
                p-4 border-2 rounded-lg text-left transition-all
                ${selectedStrategy === strategy.id
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  {strategy.icon}
                </div>
                {selectedStrategy === strategy.id && (
                  <Badge>Selected</Badge>
                )}
              </div>
              <h3 className="font-semibold mb-1">{strategy.name}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {strategy.description}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                {strategy.useCase}
              </p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
