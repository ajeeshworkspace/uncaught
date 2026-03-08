<?php

declare(strict_types=1);

namespace Uncaught\Integrations\Laravel;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Uncaught\Uncaught;

/**
 * Laravel middleware that:
 *  1. Adds a navigation breadcrumb for each request.
 *  2. Captures unhandled exceptions with HTTP request context.
 */
class UncaughtMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next): Response
    {
        $client = Uncaught::getClient();

        if ($client === null) {
            return $next($request);
        }

        // Add navigation breadcrumb
        $client->addBreadcrumb(
            'navigation',
            'http',
            sprintf('%s %s', $request->method(), $request->path()),
            [
                'method' => $request->method(),
                'url' => $request->fullUrl(),
                'ip' => $request->ip(),
            ]
        );

        try {
            $response = $next($request);

            // Capture 5xx errors as warnings
            if ($response->getStatusCode() >= 500) {
                $client->addBreadcrumb(
                    'api_call',
                    'http.response',
                    sprintf('HTTP %d', $response->getStatusCode()),
                    ['status' => $response->getStatusCode()]
                );
            }

            return $response;
        } catch (\Throwable $e) {
            // Build request context
            $requestContext = [
                'method' => $request->method(),
                'url' => $request->fullUrl(),
                'headers' => self::sanitizeHeaders($request->headers->all()),
                'query' => $request->query->all(),
            ];

            // Capture with request context
            $client->captureException($e, [
                'request' => $requestContext,
            ]);

            throw $e;
        }
    }

    /**
     * Strip sensitive headers, keeping only safe ones.
     */
    private static function sanitizeHeaders(array $headers): array
    {
        $safeHeaders = [
            'host', 'user-agent', 'accept', 'accept-language',
            'accept-encoding', 'content-type', 'content-length',
            'referer', 'origin', 'x-requested-with',
        ];

        $result = [];
        foreach ($headers as $key => $values) {
            $lowerKey = strtolower($key);
            if (in_array($lowerKey, $safeHeaders, true)) {
                $result[$key] = is_array($values) ? implode(', ', $values) : $values;
            }
        }

        return $result;
    }
}
