'use client';

/**
 * A component that always throws during render.
 * This tests the React Error Boundary integration.
 */
export function BuggyComponent(): JSX.Element {
  // This will throw during render, caught by UncaughtErrorBoundary
  throw new Error(
    '💥 Render error! This component crashed during render. ' +
    'The Error Boundary should catch this and report it to Uncaught.'
  );
}
