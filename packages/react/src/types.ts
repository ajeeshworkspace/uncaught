import type { ReactNode } from 'react';
import type { UncaughtConfig, UncaughtClient, UncaughtEvent } from '@uncaught/core';

/**
 * Value provided by the UncaughtContext to descendant components.
 */
export interface UncaughtContextValue {
  /** The initialized UncaughtClient instance, or null if not yet initialized. */
  client: UncaughtClient | null;
}

/**
 * Props for the UncaughtProvider component.
 * Extends UncaughtConfig so all core configuration can be passed directly.
 */
export interface UncaughtProviderProps extends UncaughtConfig {
  /** React children to render inside the provider. */
  children: ReactNode;

  /**
   * Fallback UI to render when an error is caught by the built-in error boundary.
   * Can be a ReactNode or a render function receiving the caught error.
   */
  fallback?: ReactNode | ((error: Error) => ReactNode);

  /**
   * When true, show a default error dialog when an error is caught.
   * Only applies if no custom fallback is provided.
   * @default false
   */
  showDialog?: boolean;
}

/**
 * Props for the UncaughtErrorBoundary component.
 */
export interface UncaughtErrorBoundaryProps {
  /** React children to render when no error has occurred. */
  children: ReactNode;

  /**
   * Fallback UI to render when an error is caught.
   * Can be a ReactNode or a render function receiving the caught error.
   */
  fallback?: ReactNode | ((error: Error) => ReactNode);

  /**
   * When true, show a default error dialog when an error is caught
   * and no custom fallback is provided.
   * @default false
   */
  showDialog?: boolean;

  /**
   * Callback invoked when an error is caught, after it has been reported.
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;

  /**
   * Callback invoked before the error is captured, allowing mutation
   * of the event data before it is sent.
   */
  beforeCapture?: (event: UncaughtEvent, error: Error) => UncaughtEvent | void;
}

/**
 * Internal state for the UncaughtErrorBoundary component.
 */
export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
