<?php

declare(strict_types=1);

namespace Uncaught\Integrations\Laravel;

use Illuminate\Support\ServiceProvider;
use Uncaught\Client;
use Uncaught\Uncaught;

/**
 * Laravel service provider for Uncaught.
 *
 * Registers the SDK as a singleton and configures automatic error capturing.
 *
 * Usage in config/app.php:
 *   'providers' => [
 *       Uncaught\Integrations\Laravel\UncaughtServiceProvider::class,
 *   ],
 *
 * Publish config with:
 *   php artisan vendor:publish --tag=uncaught-config
 */
class UncaughtServiceProvider extends ServiceProvider
{
    /**
     * Register bindings in the container.
     */
    public function register(): void
    {
        // Merge default config
        $this->mergeConfigFrom($this->configPath(), 'uncaught');

        // Register the client as a singleton
        $this->app->singleton(Client::class, function ($app) {
            $config = $app['config']->get('uncaught', []);

            // Auto-detect environment and release from Laravel config
            $config['environment'] = $config['environment']
                ?? $app->environment();
            $config['release'] = $config['release']
                ?? ($app['config']->get('app.version') ?? null);

            return Uncaught::init($config);
        });

        // Alias for convenience
        $this->app->alias(Client::class, 'uncaught');
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Publish config file
        if ($this->app->runningInConsole()) {
            $this->publishes([
                $this->configPath() => config_path('uncaught.php'),
            ], 'uncaught-config');
        }

        // Eagerly resolve to register global handlers
        $this->app->make(Client::class);

        // Register middleware for HTTP context
        if ($this->app->bound('router')) {
            /** @var \Illuminate\Routing\Router $router */
            $router = $this->app->make('router');
            $router->pushMiddlewareToGroup('web', UncaughtMiddleware::class);
            $router->pushMiddlewareToGroup('api', UncaughtMiddleware::class);
        }
    }

    private function configPath(): string
    {
        return dirname(__DIR__, 3) . '/config/uncaught.php';
    }
}
