<?php

declare(strict_types=1);

namespace Uncaught;

/**
 * Transport layer — writes events to .uncaught/ directory (local file transport).
 */
class Transport
{
    private array $config;
    private string $baseDir;
    private bool $initialised = false;

    public function __construct(array $config)
    {
        $this->config = $config;
        $this->baseDir = $config['localOutputDir']
            ?? (getcwd() . DIRECTORY_SEPARATOR . '.uncaught');
    }

    /**
     * Send an event to the transport.
     */
    public function send(array $event): void
    {
        $mode = $this->config['transport'] ?? 'local';

        switch ($mode) {
            case 'console':
                $this->sendConsole($event);
                break;
            case 'local':
            default:
                $this->sendLocal($event);
                break;
        }
    }

    /**
     * Flush queued events.
     */
    public function flush(): void
    {
        // Local file transport writes synchronously; nothing to flush.
    }

    // -----------------------------------------------------------------------
    // Console Transport
    // -----------------------------------------------------------------------

    private function sendConsole(array $event): void
    {
        $title = sprintf(
            '[uncaught] %s: %s',
            $event['error']['type'] ?? 'Error',
            $event['error']['message'] ?? '(no message)'
        );

        error_log("--- {$title} ---");
        error_log("Event ID: {$event['eventId']}");
        error_log("Fingerprint: {$event['fingerprint']}");

        if (!empty($event['error']['stack'])) {
            error_log("Stack: {$event['error']['stack']}");
        }

        if (!empty($event['fixPrompt'])) {
            error_log("Fix Prompt:\n{$event['fixPrompt']}");
        }
    }

    // -----------------------------------------------------------------------
    // Local File Transport
    // -----------------------------------------------------------------------

    private function sendLocal(array $event): void
    {
        try {
            $this->ensureInit();

            $fp = $event['fingerprint'];
            $eventDir = $this->baseDir . DIRECTORY_SEPARATOR . 'events' . DIRECTORY_SEPARATOR . $fp;

            if (!is_dir($eventDir)) {
                mkdir($eventDir, 0755, true);
            }

            $json = json_encode($event, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
            if ($json === false) {
                return;
            }

            // Write timestamped event file (atomic: .tmp -> rename)
            $ts = str_replace([':', '.'], '-', $event['timestamp']);
            $eventFile = "event-{$ts}.json";
            $eventPath = $eventDir . DIRECTORY_SEPARATOR . $eventFile;
            $tmpEventPath = $eventPath . '.tmp';
            file_put_contents($tmpEventPath, $json);
            rename($tmpEventPath, $eventPath);

            // Write / overwrite latest.json
            $latestPath = $eventDir . DIRECTORY_SEPARATOR . 'latest.json';
            $tmpLatestPath = $latestPath . '.tmp';
            file_put_contents($tmpLatestPath, $json);
            rename($tmpLatestPath, $latestPath);

            // Write fix-prompt Markdown file
            $promptFile = "{$fp}.md";
            $promptPath = $this->baseDir . DIRECTORY_SEPARATOR . 'fix-prompts' . DIRECTORY_SEPARATOR . $promptFile;
            $tmpPromptPath = $promptPath . '.tmp';
            file_put_contents($tmpPromptPath, $event['fixPrompt'] ?? '');
            rename($tmpPromptPath, $promptPath);

            // Update issues.json index
            $this->updateIssuesIndex($event, $eventFile, $promptFile);
        } catch (\Throwable $e) {
            // Never crash the host app.
            if ($this->config['debug'] ?? false) {
                error_log("[uncaught] Transport error: {$e->getMessage()}");
            }
        }
    }

    private function ensureInit(): void
    {
        if ($this->initialised) {
            return;
        }

        // Create directory structure
        $eventsDir = $this->baseDir . DIRECTORY_SEPARATOR . 'events';
        $promptsDir = $this->baseDir . DIRECTORY_SEPARATOR . 'fix-prompts';

        if (!is_dir($eventsDir)) {
            mkdir($eventsDir, 0755, true);
        }
        if (!is_dir($promptsDir)) {
            mkdir($promptsDir, 0755, true);
        }

        // Auto-add .uncaught/ to .gitignore
        $this->ensureGitignore();

        $this->initialised = true;
    }

    private function ensureGitignore(): void
    {
        try {
            $gitignorePath = dirname($this->baseDir) . DIRECTORY_SEPARATOR . '.gitignore';
            $content = file_exists($gitignorePath) ? file_get_contents($gitignorePath) : '';

            if ($content !== false && !str_contains($content, '.uncaught')) {
                $line = "\n# Uncaught local error store\n.uncaught/\n";
                file_put_contents($gitignorePath, $content . $line);
            }
        } catch (\Throwable) {
            // Non-critical — swallow.
        }
    }

    private function updateIssuesIndex(array $event, string $eventFile, string $promptFile): void
    {
        $indexPath = $this->baseDir . DIRECTORY_SEPARATOR . 'issues.json';

        $issues = [];
        if (file_exists($indexPath)) {
            $raw = file_get_contents($indexPath);
            if ($raw !== false) {
                $decoded = json_decode($raw, true);
                if (is_array($decoded)) {
                    $issues = $decoded;
                }
            }
        }

        $userId = $event['user']['id'] ?? $event['user']['email'] ?? 'anonymous';
        $existingIdx = null;

        foreach ($issues as $idx => $issue) {
            if ($issue['fingerprint'] === $event['fingerprint']) {
                $existingIdx = $idx;
                break;
            }
        }

        if ($existingIdx !== null) {
            $issues[$existingIdx]['count']++;
            $issues[$existingIdx]['lastSeen'] = $event['timestamp'];
            $issues[$existingIdx]['latestEventFile'] = $eventFile;
            $issues[$existingIdx]['fixPromptFile'] = $promptFile;
            if (!in_array($userId, $issues[$existingIdx]['affectedUsers'], true)) {
                $issues[$existingIdx]['affectedUsers'][] = $userId;
            }
            if ($issues[$existingIdx]['status'] === 'resolved') {
                $issues[$existingIdx]['status'] = 'open';
            }
        } else {
            $issues[] = [
                'fingerprint' => $event['fingerprint'],
                'title' => $event['error']['message'],
                'errorType' => $event['error']['type'],
                'count' => 1,
                'affectedUsers' => [$userId],
                'firstSeen' => $event['timestamp'],
                'lastSeen' => $event['timestamp'],
                'status' => 'open',
                'fixPromptFile' => $promptFile,
                'latestEventFile' => $eventFile,
                'release' => $event['release'] ?? null,
                'environment' => $event['environment']['deploy'] ?? null,
            ];
        }

        // Atomic write
        $tmpIndexPath = $indexPath . '.tmp';
        file_put_contents($tmpIndexPath, json_encode($issues, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        rename($tmpIndexPath, $indexPath);
    }
}
