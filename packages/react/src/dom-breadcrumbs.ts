import type { UncaughtClient } from '@uncaught/core';

/**
 * Maximum length for breadcrumb messages to avoid excessively large payloads.
 */
const MAX_MESSAGE_LENGTH = 200;

/**
 * Truncate a string to a maximum length, appending "..." if truncated.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

/**
 * Extract a human-readable description of a clicked element.
 */
function describeElement(element: HTMLElement): string {
  const tag = element.tagName?.toLowerCase() ?? 'unknown';
  const type =
    tag === 'input'
      ? (element as HTMLInputElement).type?.toLowerCase()
      : undefined;

  // Don't record anything from password inputs
  if (type === 'password') {
    return 'password input';
  }

  // Determine element role for description
  let role: string;
  if (tag === 'button' || element.getAttribute('role') === 'button') {
    role = 'button';
  } else if (tag === 'a') {
    role = 'link';
  } else if (tag === 'input') {
    role = `${type ?? 'text'} input`;
  } else if (tag === 'select') {
    role = 'dropdown';
  } else if (tag === 'textarea') {
    role = 'textarea';
  } else {
    role = tag;
  }

  // Get meaningful text content
  let text: string | null = null;

  // aria-label is highest priority for meaningful text
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    text = ariaLabel;
  }
  // For buttons and links, try innerText
  else if (tag === 'button' || tag === 'a') {
    const innerText = element.innerText?.trim();
    if (innerText) {
      text = innerText.split('\n')[0]; // First line only
    }
  }
  // For inputs, use placeholder or name
  else if (tag === 'input' || tag === 'textarea') {
    const placeholder = (element as HTMLInputElement).placeholder;
    const name = element.getAttribute('name');
    text = placeholder || name || null;
  }

  // Build description
  const id = element.id ? `#${element.id}` : '';
  const textPart = text ? ` '${truncate(text, 50)}'` : '';

  return `Clicked${textPart} ${role}${id}`;
}

/**
 * Set up click tracking as breadcrumbs.
 * Uses capture phase to intercept clicks before they may be stopped.
 */
function setupClickTracking(client: UncaughtClient): () => void {
  const handleClick = (event: MouseEvent): void => {
    try {
      const target = event.target as HTMLElement | null;
      if (!target || !target.tagName) return;

      // Don't record clicks on password inputs
      if (
        target.tagName.toLowerCase() === 'input' &&
        (target as HTMLInputElement).type?.toLowerCase() === 'password'
      ) {
        return;
      }

      const message = describeElement(target);

      client.addBreadcrumb({
        timestamp: new Date().toISOString(),
        type: 'click',
        category: 'ui.click',
        message: truncate(message, MAX_MESSAGE_LENGTH),
        level: 'info',
        data: {
          tag: target.tagName.toLowerCase(),
          id: target.id || undefined,
          className:
            typeof target.className === 'string'
              ? truncate(target.className, 100)
              : undefined,
        },
      });
    } catch {
      // Silently ignore - never crash the host app
    }
  };

  document.addEventListener('click', handleClick, true); // capture phase
  return () => document.removeEventListener('click', handleClick, true);
}

/**
 * Set up navigation tracking as breadcrumbs.
 * Tracks popstate events and monkey-patches history.pushState / replaceState.
 */
function setupNavigationTracking(client: UncaughtClient): () => void {
  let currentUrl = window.location.href;

  const recordNavigation = (to: string): void => {
    try {
      const from = currentUrl;
      currentUrl = to;

      client.addBreadcrumb({
        timestamp: new Date().toISOString(),
        type: 'navigation',
        category: 'navigation',
        message: `Navigated to ${to}`,
        level: 'info',
        data: {
          from,
          to,
        },
      });
    } catch {
      // Silently ignore
    }
  };

  // popstate fires on back/forward
  const handlePopState = (): void => {
    recordNavigation(window.location.href);
  };

  window.addEventListener('popstate', handlePopState);

  // Monkey-patch pushState and replaceState
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalPushState(data, unused, url);
    if (url) {
      try {
        const resolvedUrl = new URL(
          String(url),
          window.location.href
        ).href;
        recordNavigation(resolvedUrl);
      } catch {
        recordNavigation(String(url));
      }
    }
  };

  history.replaceState = function (
    data: unknown,
    unused: string,
    url?: string | URL | null
  ): void {
    originalReplaceState(data, unused, url);
    if (url) {
      try {
        const resolvedUrl = new URL(
          String(url),
          window.location.href
        ).href;
        recordNavigation(resolvedUrl);
      } catch {
        recordNavigation(String(url));
      }
    }
  };

  return () => {
    window.removeEventListener('popstate', handlePopState);
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
  };
}

/**
 * Set up fetch tracking as breadcrumbs.
 * Monkey-patches window.fetch to record API calls with method, URL, status, and duration.
 * Does NOT record request/response bodies. Skips requests to the Uncaught API.
 */
function setupFetchTracking(client: UncaughtClient): () => void {
  const originalFetch = window.fetch.bind(window);

  // Get the Uncaught API endpoint to exclude self-reporting requests
  const config = client.getConfig?.() ?? {};
  const apiEndpoint =
    (config as Record<string, unknown>).endpoint ??
    (config as Record<string, unknown>).dsn ??
    '';
  const uncaughtEndpoints: string[] = [];

  if (typeof apiEndpoint === 'string' && apiEndpoint) {
    try {
      const url = new URL(apiEndpoint);
      uncaughtEndpoints.push(url.hostname);
    } catch {
      uncaughtEndpoints.push(apiEndpoint);
    }
  }

  // Also exclude common Uncaught API patterns
  uncaughtEndpoints.push('uncaught.dev');
  uncaughtEndpoints.push('api.uncaught');

  const isUncaughtRequest = (url: string): boolean => {
    return uncaughtEndpoints.some(
      (endpoint) => endpoint && url.includes(endpoint)
    );
  };

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input);

    const method = (
      init?.method ??
      (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    // Skip Uncaught's own requests to prevent infinite loops
    if (isUncaughtRequest(url)) {
      return originalFetch(input, init);
    }

    const startTime = Date.now();

    try {
      const response = await originalFetch(input, init);
      const duration = Date.now() - startTime;
      const isError = response.status >= 400;

      try {
        // Truncate URL for the breadcrumb to avoid huge payloads
        const displayUrl = truncate(url, 150);

        client.addBreadcrumb({
          timestamp: new Date().toISOString(),
          type: 'api_call',
          category: 'fetch',
          message: `${method} ${displayUrl} [${response.status}]`,
          level: isError ? 'error' : 'info',
          data: {
            method,
            url: displayUrl,
            status: response.status,
            statusText: response.statusText,
            duration,
          },
        });
      } catch {
        // Silently ignore breadcrumb failures
      }

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      try {
        const displayUrl = truncate(url, 150);

        client.addBreadcrumb({
          timestamp: new Date().toISOString(),
          type: 'api_call',
          category: 'fetch',
          message: `${method} ${displayUrl} [Network Error]`,
          level: 'error',
          data: {
            method,
            url: displayUrl,
            status: 0,
            error:
              error instanceof Error
                ? error.message
                : 'Network error',
            duration,
          },
        });
      } catch {
        // Silently ignore breadcrumb failures
      }

      throw error; // Re-throw so the app's error handling still works
    }
  };

  return () => {
    window.fetch = originalFetch;
  };
}

/**
 * Set up automatic DOM breadcrumb tracking including clicks,
 * navigation changes, and fetch API calls.
 *
 * @param client - The UncaughtClient instance to add breadcrumbs to.
 * @returns A cleanup function that removes all listeners and restores patched functions.
 */
export function setupDomBreadcrumbs(client: UncaughtClient): () => void {
  // Guard for SSR environments
  if (typeof window === 'undefined') {
    return () => {};
  }

  const cleanups: Array<() => void> = [];

  try {
    cleanups.push(setupClickTracking(client));
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Uncaught] Failed to set up click tracking:', e);
    }
  }

  try {
    cleanups.push(setupNavigationTracking(client));
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error(
        '[Uncaught] Failed to set up navigation tracking:',
        e
      );
    }
  }

  try {
    cleanups.push(setupFetchTracking(client));
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Uncaught] Failed to set up fetch tracking:', e);
    }
  }

  return () => {
    cleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        // Silently ignore cleanup failures
      }
    });
  };
}
