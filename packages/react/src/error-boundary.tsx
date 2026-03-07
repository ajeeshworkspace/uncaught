'use client';

import React, { Component } from 'react';
import type { UncaughtClient } from '@uncaughtdev/core';
import { UncaughtContext } from './context';
import type { UncaughtErrorBoundaryProps, ErrorBoundaryState } from './types';

/**
 * React Error Boundary that captures errors and reports them to Uncaught.
 *
 * Must be a class component as React does not support error boundaries
 * via function components / hooks.
 *
 * Usage:
 * ```tsx
 * <UncaughtErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <MyApp />
 * </UncaughtErrorBoundary>
 * ```
 */
export class UncaughtErrorBoundary extends Component<
  UncaughtErrorBoundaryProps,
  ErrorBoundaryState
> {
  static contextType = UncaughtContext;
  declare context: React.ContextType<typeof UncaughtContext>;

  private removePopstateListener: (() => void) | null = null;

  constructor(props: UncaughtErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    try {
      const client: UncaughtClient | null = this.context?.client ?? null;
      const { onError, beforeCapture } = this.props;

      // Extract component stack for richer error context
      const componentStack = errorInfo.componentStack ?? undefined;

      if (client) {
        client.captureError(error, {
          componentStack,
        });

        // Add a breadcrumb noting the error boundary source
        client.addBreadcrumb({
          type: 'custom',
          category: 'react.error_boundary',
          message: `Error boundary caught: ${error.message}`,
          level: 'error',
        });
      }

      // Invoke the user's onError callback if provided
      if (onError) {
        onError(error, errorInfo);
      }
    } catch (e) {
      // Never crash the host app from error reporting itself
      if (process.env.NODE_ENV === 'development') {
        console.error('[Uncaught] Error in componentDidCatch handler:', e);
      }
    }
  }

  componentDidMount(): void {
    // Auto-reset the error boundary when the user navigates via browser back/forward
    if (typeof window !== 'undefined') {
      const handlePopState = (): void => {
        if (this.state.hasError) {
          this.resetError();
        }
      };

      window.addEventListener('popstate', handlePopState);
      this.removePopstateListener = () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  }

  componentWillUnmount(): void {
    if (this.removePopstateListener) {
      this.removePopstateListener();
      this.removePopstateListener = null;
    }
  }

  /**
   * Reset the error boundary state, allowing children to re-render.
   */
  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback, showDialog } = this.props;

    if (!hasError || !error) {
      return children;
    }

    // Custom fallback: render function
    if (typeof fallback === 'function') {
      try {
        return fallback(error);
      } catch (e) {
        // If the fallback itself throws, fall through to default
        if (process.env.NODE_ENV === 'development') {
          console.error('[Uncaught] Fallback render function threw:', e);
        }
      }
    }

    // Custom fallback: ReactNode
    if (fallback !== undefined && typeof fallback !== 'function') {
      return fallback;
    }

    // Default dialog UI
    if (showDialog) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '20px',
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
            backgroundColor: '#f8f9fa',
          }}
        >
          <div
            style={{
              maxWidth: '480px',
              width: '100%',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              boxShadow:
                '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                fontSize: '24px',
                color: '#dc2626',
              }}
            >
              !
            </div>
            <h2
              style={{
                margin: '0 0 8px',
                fontSize: '20px',
                fontWeight: 600,
                color: '#111827',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                margin: '0 0 24px',
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: 1.5,
              }}
            >
              An unexpected error occurred. Our team has been notified and is
              working on a fix.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <pre
                style={{
                  textAlign: 'left',
                  backgroundColor: '#f3f4f6',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#dc2626',
                  overflow: 'auto',
                  maxHeight: '120px',
                  marginBottom: '24px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {error.message}
                {error.stack && `\n\n${error.stack}`}
              </pre>
            )}
            <button
              onClick={() => {
                try {
                  if (typeof window !== 'undefined') {
                    window.location.reload();
                  }
                } catch {
                  // Silently ignore reload failures
                }
              }}
              style={{
                backgroundColor: '#3b82f6',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 24px',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
              }}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  '#2563eb';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor =
                  '#3b82f6';
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    // No fallback and no dialog: render nothing (transparent failure)
    return null;
  }
}
