<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Type definitions / constants for the Uncaught PHP SDK.
 *
 * PHP does not have a structural type system like TypeScript, so these
 * are provided as class constants and docblock hints for IDE support.
 */
final class Types
{
    // Transport modes
    public const TRANSPORT_REMOTE = 'remote';
    public const TRANSPORT_LOCAL = 'local';
    public const TRANSPORT_CONSOLE = 'console';

    // Severity levels
    public const LEVEL_FATAL = 'fatal';
    public const LEVEL_ERROR = 'error';
    public const LEVEL_WARNING = 'warning';
    public const LEVEL_INFO = 'info';
    public const LEVEL_DEBUG = 'debug';

    // Breadcrumb types
    public const BREADCRUMB_CLICK = 'click';
    public const BREADCRUMB_NAVIGATION = 'navigation';
    public const BREADCRUMB_API_CALL = 'api_call';
    public const BREADCRUMB_DB_QUERY = 'db_query';
    public const BREADCRUMB_AUTH = 'auth';
    public const BREADCRUMB_CONSOLE = 'console';
    public const BREADCRUMB_WEB_VITAL = 'web_vital';
    public const BREADCRUMB_CUSTOM = 'custom';

    // Issue statuses
    public const STATUS_OPEN = 'open';
    public const STATUS_RESOLVED = 'resolved';
    public const STATUS_IGNORED = 'ignored';

    /**
     * Valid severity levels.
     * @return string[]
     */
    public static function severityLevels(): array
    {
        return [
            self::LEVEL_FATAL,
            self::LEVEL_ERROR,
            self::LEVEL_WARNING,
            self::LEVEL_INFO,
            self::LEVEL_DEBUG,
        ];
    }

    /**
     * Valid breadcrumb types.
     * @return string[]
     */
    public static function breadcrumbTypes(): array
    {
        return [
            self::BREADCRUMB_CLICK,
            self::BREADCRUMB_NAVIGATION,
            self::BREADCRUMB_API_CALL,
            self::BREADCRUMB_DB_QUERY,
            self::BREADCRUMB_AUTH,
            self::BREADCRUMB_CONSOLE,
            self::BREADCRUMB_WEB_VITAL,
            self::BREADCRUMB_CUSTOM,
        ];
    }

    private function __construct()
    {
    }
}
