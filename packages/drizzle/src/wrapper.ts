import { getClient, type UncaughtClient } from '@uncaughtdev/core';

export interface WrapDrizzleOptions {
  client?: UncaughtClient;
}

export function wrapDrizzle<T>(db: T, options?: WrapDrizzleOptions): T {
  const uncaughtClient = options?.client ?? getClient();

  const handler: ProxyHandler<any> = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === 'function') {
        return (...args: any[]) => {
          // Add breadcrumb for query methods
          if (['select', 'insert', 'update', 'delete', 'execute'].includes(String(prop))) {
            uncaughtClient?.addBreadcrumb({
              type: 'db_query',
              category: 'drizzle',
              message: `db.${String(prop)}()`,
            });
          }
          try {
            const result = value.apply(target, args);
            // Handle promises
            if (result && typeof result.then === 'function') {
              return result.catch((error: any) => {
                uncaughtClient?.captureError(error, {
                  operation: {
                    provider: 'drizzle',
                    type: 'query',
                    method: String(prop),
                    errorDetails: error.message,
                  },
                });
                throw error;
              });
            }
            return result;
          } catch (error: any) {
            uncaughtClient?.captureError(error, {
              operation: {
                provider: 'drizzle',
                type: 'query',
                method: String(prop),
                errorDetails: error.message,
              },
            });
            throw error;
          }
        };
      }
      return value;
    },
  };

  return new Proxy(db as any, handler) as T;
}
