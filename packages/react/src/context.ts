'use client';

import { createContext } from 'react';
import type { UncaughtContextValue } from './types';

/**
 * React context that provides the UncaughtClient instance to descendant components.
 * The context value is null when no UncaughtProvider is present in the tree.
 */
export const UncaughtContext = createContext<UncaughtContextValue>({
  client: null,
});

UncaughtContext.displayName = 'UncaughtContext';
