import { cn } from '@/lib/utils';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };
  
  return (
    <div className={cn('animate-spin rounded-full border-b-2 border-blue-600', sizes[size], className)} />
  );
}

interface LoadingSpinnerProps {
  message?: string;
  fullScreen?: boolean;
}

export function LoadingSpinner({ message = 'Loading...', fullScreen = false }: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Spinner size="md" />
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">{message}</p>
    </div>
  );
}
