<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * UncaughtClient — main SDK client for PHP.
 */
class Client
{
    private array $config;
    private BreadcrumbStore $breadcrumbs;
    private Transport $transport;
    private RateLimiter $rateLimiter;
    private string $sessionId;
    private array $seenFingerprints = [];
    private ?array $user = null;

    private const SDK_NAME = 'uncaught-php';
    private const SDK_VERSION = '0.1.0';

    /**
     * @param array<string, mixed> $config
     */
    public function __construct(array $config = [])
    {
        $this->config = array_merge([
            'projectKey' => null,
            'endpoint' => null,
            'environment' => null,
            'release' => null,
            'debug' => false,
            'enabled' => true,
            'maxBreadcrumbs' => 20,
            'maxEventsPerMinute' => 30,
            'sanitizeKeys' => [],
            'ignoreErrors' => [],
            'transport' => 'local',
            'localOutputDir' => null,
        ], $config);

        $this->breadcrumbs = new BreadcrumbStore((int)$this->config['maxBreadcrumbs']);
        $this->transport = new Transport($this->config);
        $this->rateLimiter = new RateLimiter(
            (int)$this->config['maxEventsPerMinute'],
            5
        );
        $this->sessionId = $this->generateUuid();
    }

    /**
     * Return the current SDK configuration.
     */
    public function getConfig(): array
    {
        return $this->config;
    }

    /**
     * Capture a Throwable and send it through the transport pipeline.
     *
     * @return string|null The event ID, or null if the event was dropped.
     */
    public function captureException(\Throwable $e, array $context = []): ?string
    {
        try {
            if (!$this->config['enabled']) {
                return null;
            }

            // Normalise error
            $errorInfo = [
                'message' => $e->getMessage() ?: (string)$e,
                'type' => (new \ReflectionClass($e))->getShortName(),
                'stack' => $e->getTraceAsString(),
            ];

            // Check ignoreErrors
            if ($this->shouldIgnore($errorInfo['message'])) {
                $this->debugLog('Event ignored by ignoreErrors filter');
                return null;
            }

            // Fingerprint
            $fingerprint = Fingerprint::generate($errorInfo);

            // Rate limit
            if (!$this->rateLimiter->shouldAllow($fingerprint)) {
                $this->debugLog("Rate-limited: {$fingerprint}");
                return null;
            }

            // Collect breadcrumbs
            $crumbs = $this->breadcrumbs->getAll();

            // Detect environment
            $environment = EnvironmentDetector::detect();
            if ($this->config['environment'] !== null) {
                $environment['deploy'] = $this->config['environment'];
            }

            // Build user info
            $userInfo = $this->user ?? [];
            $userInfo['sessionId'] = $this->sessionId;

            // Build event
            $eventId = $this->generateUuid();
            $event = [
                'eventId' => $eventId,
                'timestamp' => gmdate('Y-m-d\TH:i:s.v\Z'),
                'projectKey' => $this->config['projectKey'],
                'level' => $context['level'] ?? 'error',
                'fingerprint' => $fingerprint,
                'release' => $this->config['release'],
                'error' => $errorInfo,
                'breadcrumbs' => $crumbs,
                'request' => $context['request'] ?? null,
                'operation' => $context['operation'] ?? null,
                'environment' => $environment,
                'user' => $userInfo,
                'userFeedback' => null,
                'fixPrompt' => '',
                'sdk' => [
                    'name' => self::SDK_NAME,
                    'version' => self::SDK_VERSION,
                ],
            ];

            // Sanitize
            $event = Sanitizer::sanitize($event, $this->config['sanitizeKeys']);

            // Build fix prompt
            $event['fixPrompt'] = PromptBuilder::build($event);

            // beforeSend hook
            if (isset($this->config['beforeSend']) && is_callable($this->config['beforeSend'])) {
                $result = ($this->config['beforeSend'])($event);
                if ($result === null) {
                    $this->debugLog('Event dropped by beforeSend');
                    return null;
                }
                $event = $result;
            }

            // Send
            $this->transport->send($event);
            $this->debugLog("Captured event: {$eventId} ({$fingerprint})");

            // Track seen fingerprints
            $this->seenFingerprints[$fingerprint] = true;

            return $eventId;
        } catch (\Throwable $err) {
            $this->debugLog("captureException failed: {$err->getMessage()}");
            return null;
        }
    }

    /**
     * Capture a plain message.
     */
    public function captureMessage(string $message, string $level = 'info'): ?string
    {
        try {
            $exception = new \RuntimeException($message);
            return $this->captureException($exception, ['level' => $level]);
        } catch (\Throwable $err) {
            $this->debugLog("captureMessage failed: {$err->getMessage()}");
            return null;
        }
    }

    /**
     * Add a breadcrumb to the ring buffer.
     */
    public function addBreadcrumb(
        string $type,
        string $category,
        string $message,
        ?array $data = null,
        ?string $level = null
    ): void {
        if (!$this->config['enabled']) {
            return;
        }
        $this->breadcrumbs->add([
            'type' => $type,
            'category' => $category,
            'message' => $message,
            'data' => $data,
            'level' => $level,
        ]);
    }

    /**
     * Set user context that will be attached to subsequent events.
     */
    public function setUser(?array $user): void
    {
        $this->user = $user;
    }

    /**
     * Flush all queued events to the transport.
     */
    public function flush(): void
    {
        $this->transport->flush();
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private function shouldIgnore(string $message): bool
    {
        foreach ($this->config['ignoreErrors'] as $pattern) {
            if (is_string($pattern) && str_contains($message, $pattern)) {
                return true;
            }
            if ($pattern instanceof \Closure && $pattern($message)) {
                return true;
            }
        }
        return false;
    }

    private function debugLog(string $msg): void
    {
        if ($this->config['debug']) {
            error_log("[uncaught] {$msg}");
        }
    }

    private function generateUuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // Version 4
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // Variant

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
