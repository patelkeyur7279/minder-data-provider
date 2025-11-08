import React, { Component, ErrorInfo, ReactNode } from "react";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, errorInfo: ErrorInfo) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
  onReset?: () => void;
  /**
   * ARIA label for the error boundary container
   * @default "Error boundary"
   */
  ariaLabel?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string; // For ARIA describedby
}

/**
 * Error Boundary component for graceful error handling in React apps
 *
 * @example
 * ```tsx
 * <MinderErrorBoundary
 *   fallback={<div>Something went wrong</div>}
 *   onError={(error, errorInfo) => {
 *     console.error('Error caught:', error, errorInfo);
 *   }}
 * >
 *   <YourApp />
 * </MinderErrorBoundary>
 * ```
 */
export class MinderErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: `error-${Math.random().toString(36).substr(2, 9)}`,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    const { resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (
      hasError &&
      resetKeys &&
      prevProps.resetKeys &&
      resetKeys.some((key, index) => key !== prevProps.resetKeys![index])
    ) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: `error-${Math.random().toString(36).substr(2, 9)}`,
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    const { hasError, error, errorInfo, errorId } = this.state;
    const { children, fallback, ariaLabel = "Error boundary" } = this.props;

    if (hasError && error) {
      // If custom fallback is a function, call it with error details
      if (typeof fallback === "function" && errorInfo) {
        return fallback(error, errorInfo);
      }

      // If custom fallback is provided and not a function, render it
      if (fallback && typeof fallback !== "function") {
        return fallback;
      }

      // Default fallback UI with full accessibility support
      return (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          aria-label={ariaLabel}
          aria-describedby={errorId}
          tabIndex={-1}
          ref={(el) => {
            // Auto-focus on error for screen readers
            if (el && hasError) {
              el.focus();
            }
          }}
          style={{
            padding: "20px",
            margin: "20px",
            border: "1px solid #f5222d",
            borderRadius: "4px",
            backgroundColor: "#fff2e8",
            outline: "none",
          }}>
          <h2 style={{ color: "#f5222d", marginTop: 0 }}>
            ⚠️ Something went wrong
          </h2>
          <details style={{ whiteSpace: "pre-wrap", marginBottom: "10px" }}>
            <summary
              style={{ cursor: "pointer", marginBottom: "10px" }}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (e.target as HTMLElement).click();
                }
              }}>
              Error Details
            </summary>
            <div id={errorId}>
              <p style={{ margin: "10px 0" }}>
                <strong>Error:</strong> {error.toString()}
              </p>
              {errorInfo && (
                <pre
                  style={{
                    backgroundColor: "#fff",
                    padding: "10px",
                    borderRadius: "4px",
                    overflow: "auto",
                    fontSize: "12px",
                  }}
                  aria-label="Error stack trace">
                  {errorInfo.componentStack}
                </pre>
              )}
            </div>
          </details>
          <button
            onClick={this.reset}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                this.reset();
              }
            }}
            aria-label="Try again to recover from error"
            style={{
              padding: "8px 16px",
              backgroundColor: "#1890ff",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}>
            Try Again
          </button>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook-based alternative to ErrorBoundary for functional components
 * Note: This must be used inside a MinderErrorBoundary component
 */
export function useErrorHandler<T = Error>(
  givenError?: T | null | undefined
): (error: T) => void {
  const [error, setError] = React.useState<T | null>(null);

  if (givenError != null) {
    throw givenError;
  }

  if (error != null) {
    throw error;
  }

  return setError;
}

export default MinderErrorBoundary;
