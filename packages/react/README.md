# @uncaughtdev/react

React and Next.js SDK for [Uncaught](https://github.com/AjeeshDevops/uncaught) error monitoring.

## Install

```bash
npx uncaughtdev init
```

Or manually:

```bash
npm install @uncaughtdev/react
```

## What's included

- `<UncaughtProvider>` — wraps your app, auto-captures errors
- React Error Boundary with componentStack capture and user feedback widget
- `useErrorHandler` hook — wraps event handlers (onClick, onChange) with error capture
- `withErrorCapture` HOF — standalone error wrapping for class components
- Web Vitals tracking (LCP, FID, CLS, FCP, TTFB) via native PerformanceObserver
- DOM breadcrumbs (clicks, navigation, fetch tracking, XHR tracking)
- Global error and unhandled rejection handlers
- Next.js App Router and Pages Router support

## Usage

```tsx
import { UncaughtProvider, UncaughtErrorBoundary, useErrorHandler } from '@uncaughtdev/react';

function App() {
  return (
    <UncaughtProvider projectKey="my-app">
      <UncaughtErrorBoundary showDialog>
        <MyApp />
      </UncaughtErrorBoundary>
    </UncaughtProvider>
  );
}

function MyComponent() {
  const handleClick = useErrorHandler(() => {
    riskyOperation(); // Errors captured automatically
  });

  return <button onClick={handleClick}>Click</button>;
}
```

## License

MIT
