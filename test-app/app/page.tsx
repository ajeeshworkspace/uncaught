'use client';

import { useState } from 'react';
import { useReportError, useBreadcrumb } from '@uncaught/react';
import { BuggyComponent } from './buggy-component';

export default function Home() {
  const reportError = useReportError();
  const addBreadcrumb = useBreadcrumb();
  const [showBuggy, setShowBuggy] = useState(false);

  const handleCaughtError = () => {
    addBreadcrumb({
      type: 'click',
      category: 'ui.click',
      message: 'User clicked "Trigger Caught Error" button',
    });

    try {
      // Simulate an operation that fails
      const data: any = null;
      data.nested.property.access();
    } catch (err) {
      reportError(err as Error);
    }
  };

  const handleUncaughtError = () => {
    addBreadcrumb({
      type: 'click',
      category: 'ui.click',
      message: 'User clicked "Trigger Uncaught Error" button',
    });

    // This will be caught by window.onerror / global handler
    setTimeout(() => {
      throw new Error('💥 Uncaught async error from setTimeout!');
    }, 100);
  };

  const handlePromiseRejection = () => {
    addBreadcrumb({
      type: 'click',
      category: 'ui.click',
      message: 'User clicked "Trigger Promise Rejection" button',
    });

    // This will be caught by unhandledrejection handler
    Promise.reject(new Error('💥 Unhandled promise rejection!'));
  };

  const handleFetchError = async () => {
    addBreadcrumb({
      type: 'click',
      category: 'ui.click',
      message: 'User clicked "Trigger Fetch Error" button',
    });

    try {
      const res = await fetch('/api/this-does-not-exist');
      if (!res.ok) {
        throw new Error(`Fetch failed with status ${res.status}`);
      }
    } catch (err) {
      reportError(err as Error);
    }
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>🧪 Uncaught SDK Test App</h1>
      <p style={styles.subtitle}>
        Click buttons below to trigger different error types.
        <br />
        Then run <code style={styles.code}>npx uncaught</code> in terminal to
        see captured errors.
      </p>

      <div style={styles.grid}>
        <button style={styles.button} onClick={handleCaughtError}>
          🐛 Trigger Caught Error
          <span style={styles.buttonDesc}>
            try/catch → reportError()
          </span>
        </button>

        <button style={{ ...styles.button, ...styles.orange }} onClick={handleUncaughtError}>
          💥 Trigger Uncaught Error
          <span style={styles.buttonDesc}>
            throw in setTimeout → global handler
          </span>
        </button>

        <button style={{ ...styles.button, ...styles.purple }} onClick={handlePromiseRejection}>
          🔮 Trigger Promise Rejection
          <span style={styles.buttonDesc}>
            Promise.reject → unhandledrejection
          </span>
        </button>

        <button style={{ ...styles.button, ...styles.blue }} onClick={handleFetchError}>
          🌐 Trigger Fetch Error
          <span style={styles.buttonDesc}>
            fetch 404 → caught & reported
          </span>
        </button>

        <button
          style={{ ...styles.button, ...styles.red }}
          onClick={() => setShowBuggy(true)}
        >
          🧨 Trigger Render Error
          <span style={styles.buttonDesc}>
            Component throw → Error Boundary
          </span>
        </button>
      </div>

      {showBuggy && <BuggyComponent />}

      <div style={styles.footer}>
        <p>
          After triggering errors, check the terminal:
        </p>
        <code style={styles.codeBlock}>
          cd test-app && node ../packages/core/dist/local-viewer.js
        </code>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '2rem',
    background: '#0a0a0a',
    color: '#ededed',
  },
  title: {
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
  },
  subtitle: {
    fontSize: '1.1rem',
    color: '#888',
    textAlign: 'center',
    marginBottom: '2rem',
    lineHeight: 1.6,
  },
  code: {
    background: '#1a1a2e',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
    color: '#7ee787',
    fontSize: '0.95rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '1rem',
    maxWidth: '800px',
    width: '100%',
  },
  button: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.5rem 1rem',
    fontSize: '1rem',
    fontWeight: 600,
    border: '1px solid #333',
    borderRadius: '12px',
    cursor: 'pointer',
    background: '#1a1a2e',
    color: '#ededed',
    transition: 'all 0.2s',
  },
  buttonDesc: {
    fontSize: '0.75rem',
    fontWeight: 400,
    color: '#888',
    textAlign: 'center',
  },
  orange: { borderColor: '#f97316', color: '#f97316' },
  purple: { borderColor: '#a855f7', color: '#a855f7' },
  blue: { borderColor: '#3b82f6', color: '#3b82f6' },
  red: { borderColor: '#ef4444', color: '#ef4444' },
  footer: {
    marginTop: '3rem',
    textAlign: 'center',
    color: '#666',
  },
  codeBlock: {
    display: 'block',
    background: '#1a1a2e',
    padding: '0.75rem 1.5rem',
    borderRadius: '8px',
    fontFamily: 'monospace',
    color: '#7ee787',
    marginTop: '0.5rem',
    fontSize: '0.9rem',
  },
};
