import { getClient, type UncaughtClient } from '@uncaughtdev/core';

export interface WrapPrismaOptions {
  client?: UncaughtClient;
  trackQueries?: boolean;
}

export function wrapPrisma<T extends { $use: Function }>(prisma: T, options?: WrapPrismaOptions): T {
  const uncaughtClient = options?.client ?? getClient();
  const trackQueries = options?.trackQueries ?? true;

  prisma.$use(async (params: any, next: any) => {
    const model = params.model ?? 'unknown';
    const action = params.action ?? 'unknown';

    if (trackQueries) {
      uncaughtClient?.addBreadcrumb({
        type: 'db_query',
        category: 'prisma',
        message: `${model}.${action}`,
        data: {
          model,
          action,
          args: params.args ? Object.keys(params.args) : [],
        },
      });
    }

    try {
      return await next(params);
    } catch (error: any) {
      uncaughtClient?.captureError(error, {
        operation: {
          provider: 'prisma',
          type: 'query',
          method: `${model}.${action}`,
          errorCode: error.code,
          errorDetails: error.message,
          params: { model, action },
        },
      });
      throw error;
    }
  });

  return prisma;
}
