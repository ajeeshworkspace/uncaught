<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Runtime / platform environment detector for PHP.
 */
final class EnvironmentDetector
{
    private static ?array $cached = null;

    /**
     * Detect the current runtime environment.
     * Result is cached after the first invocation.
     *
     * @return array<string, string|null>
     */
    public static function detect(): array
    {
        if (self::$cached !== null) {
            return self::$cached;
        }

        $info = [];

        try {
            // Runtime
            $info['runtime'] = 'php';
            $info['runtimeVersion'] = PHP_VERSION;
            $info['platform'] = PHP_OS_FAMILY;
            $info['os'] = self::detectOS();

            // Framework detection
            self::detectFramework($info);

            // Hosting platform markers
            if (getenv('VERCEL')) {
                $info['platform'] = 'vercel';
            } elseif (getenv('RAILWAY_PROJECT_ID')) {
                $info['platform'] = 'railway';
            } elseif (getenv('FLY_APP_NAME')) {
                $info['platform'] = 'fly';
            } elseif (getenv('AWS_LAMBDA_FUNCTION_NAME')) {
                $info['platform'] = 'aws-lambda';
            } elseif (getenv('GOOGLE_CLOUD_PROJECT')) {
                $info['platform'] = 'gcp';
            }

            // Server info
            if (PHP_SAPI === 'cli') {
                $info['deviceType'] = 'server';
            }

            // Locale & timezone
            $info['locale'] = setlocale(LC_ALL, '0') ?: null;
            $info['timezone'] = date_default_timezone_get();
        } catch (\Throwable) {
            // Silent — environment detection must never throw.
        }

        self::$cached = $info;
        return $info;
    }

    /**
     * Reset the cached environment (useful for testing).
     */
    public static function resetCache(): void
    {
        self::$cached = null;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private static function detectOS(): string
    {
        return match (PHP_OS_FAMILY) {
            'Darwin' => 'macOS',
            'Windows' => 'Windows',
            'Linux' => 'Linux',
            'BSD' => 'BSD',
            default => PHP_OS_FAMILY,
        };
    }

    private static function detectFramework(array &$info): void
    {
        // Laravel
        if (class_exists('Illuminate\Foundation\Application')) {
            $info['framework'] = 'laravel';
            try {
                $info['frameworkVersion'] = \Illuminate\Foundation\Application::VERSION;
            } catch (\Throwable) {
                // Version detection failed
            }
            return;
        }

        // Symfony
        if (class_exists('Symfony\Component\HttpKernel\Kernel')) {
            $info['framework'] = 'symfony';
            try {
                $info['frameworkVersion'] = \Symfony\Component\HttpKernel\Kernel::VERSION;
            } catch (\Throwable) {
            }
            return;
        }

        // Lumen
        if (class_exists('Laravel\Lumen\Application')) {
            $info['framework'] = 'lumen';
            return;
        }

        // Slim
        if (class_exists('Slim\App')) {
            $info['framework'] = 'slim';
            return;
        }

        // WordPress
        if (defined('ABSPATH') && defined('WPINC')) {
            $info['framework'] = 'wordpress';
            if (function_exists('get_bloginfo')) {
                $info['frameworkVersion'] = get_bloginfo('version');
            }
            return;
        }

        // Drupal
        if (defined('DRUPAL_ROOT')) {
            $info['framework'] = 'drupal';
            return;
        }
    }
}
