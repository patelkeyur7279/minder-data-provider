import { Request, Response, NextFunction } from 'express';

/**
 * Error Handling Middleware
 * 
 * Why centralized error handling?
 * - Consistent error responses
 * - Single place to log errors
 * - Cleaner route handlers
 * - Better debugging
 */

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
) {
  /**
   * Log error for debugging
   * In production, use proper logging service
   */
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  /**
   * Determine status code
   * - AppError has custom status code
   * - Default to 500 for unknown errors
   */
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';

  /**
   * Send error response
   * Don't leak internal error details in production
   */
  res.status(statusCode).json({
    success: false,
    error: {
      message: err.message || 'An unexpected error occurred',
      code,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
      }),
    },
  });
}

/**
 * 404 Not Found Handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      message: `Route ${req.method} ${req.url} not found`,
      code: 'NOT_FOUND',
    },
  });
}

/**
 * Async handler wrapper
 * Catches async errors and passes to error middleware
 * 
 * Why needed?
 * - Express doesn't catch async errors by default
 * - Prevents unhandled promise rejections
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
