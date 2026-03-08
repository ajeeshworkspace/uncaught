<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Static entry-point for the Uncaught SDK.
 *
 * Usage:
 *   Uncaught::init(['environment' => 'production', 'release' => '1.0.0']);
 *   Uncaught::captureException($e);
 */
final class Uncaught
{
    private static ?Client $client = null;

    /**
     * Initialise the Uncaught SDK. Calling this more than once replaces
     * the previous client instance.
     *
     * @param array<string, mixed> $config
     */
    public static function init(array $config = []): Client
    {
        self::$client = new Client($config);

        // Register as the global error / exception handler
        set_exception_handler([self::class, 'handleException']);
        set_error_handler([self::class, 'handleError']);
        register_shutdown_function([self::class, 'handleShutdown']);

        return self::$client;
    }

    /**
     * Return the current singleton client, or null if init() has not been called.
     */
    public static function getClient(): ?Client
    {
        return self::$client;
    }

    /**
     * Capture an exception.
     */
    public static function captureException(\Throwable $e, array $context = []): ?string
    {
        return self::$client?->captureException($e, $context);
    }

    /**
     * Capture a plain message.
     */
    public static function captureMessage(string $message, string $level = 'info'): ?string
    {
        return self::$client?->captureMessage($message, $level);
    }

    /**
     * Add a breadcrumb.
     */
    public static function addBreadcrumb(
        string $type,
        string $category,
        string $message,
        ?array $data = null,
        ?string $level = null
    ): void {
        self::$client?->addBreadcrumb($type, $category, $message, $data, $level);
    }

    /**
     * Set user context.
     */
    public static function setUser(?array $user): void
    {
        self::$client?->setUser($user);
    }

    /**
     * Global exception handler.
     */
    public static function handleException(\Throwable $e): void
    {
        self::$client?->captureException($e, ['level' => 'fatal']);
    }

    /**
     * Global error handler.
     */
    public static function handleError(
        int $errno,
        string $errstr,
        string $errfile = '',
        int $errline = 0
    ): bool {
        if (!(error_reporting() & $errno)) {
            return false;
        }

        $exception = new \ErrorException($errstr, 0, $errno, $errfile, $errline);
        $level = match (true) {
            ($errno & (E_ERROR | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR)) !== 0 => 'fatal',
            ($errno & (E_WARNING | E_CORE_WARNING | E_COMPILE_WARNING | E_USER_WARNING)) !== 0 => 'warning',
            default => 'error',
        };

        self::$client?->captureException($exception, ['level' => $level]);
        return false;
    }

    /**
     * Shutdown handler for fatal errors.
     */
    public static function handleShutdown(): void
    {
        $error = error_get_last();
        if ($error !== null && in_array($error['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR, E_PARSE], true)) {
            $exception = new \ErrorException(
                $error['message'],
                0,
                $error['type'],
                $error['file'],
                $error['line']
            );
            self::$client?->captureException($exception, ['level' => 'fatal']);
        }
    }

    private function __construct()
    {
    }
}
