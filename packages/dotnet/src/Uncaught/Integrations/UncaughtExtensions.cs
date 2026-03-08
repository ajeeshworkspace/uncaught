// ---------------------------------------------------------------------------
// Uncaught — ASP.NET Core extension methods
// ---------------------------------------------------------------------------

using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace Uncaught.Integrations;

/// <summary>
/// Extension methods for integrating Uncaught with ASP.NET Core.
/// </summary>
public static class UncaughtExtensions
{
    /// <summary>
    /// Add Uncaught services to the service collection.
    ///
    /// Usage:
    ///   builder.Services.AddUncaught(config => {
    ///       config.Environment = "production";
    ///       config.Release = "1.0.0";
    ///   });
    /// </summary>
    public static IServiceCollection AddUncaught(
        this IServiceCollection services,
        Action<UncaughtConfig>? configure = null)
    {
        var config = new UncaughtConfig();
        configure?.Invoke(config);

        var client = UncaughtClient.Init(config);

        services.AddSingleton(client);
        services.AddSingleton(config);

        return services;
    }

    /// <summary>
    /// Add Uncaught middleware to the request pipeline.
    /// This should be added early in the pipeline to catch all exceptions.
    ///
    /// Usage:
    ///   app.UseUncaught();
    /// </summary>
    public static IApplicationBuilder UseUncaught(this IApplicationBuilder app)
    {
        return app.UseMiddleware<UncaughtMiddleware>();
    }

    /// <summary>
    /// Add Uncaught services and middleware in one call.
    /// Convenience method for minimal API apps.
    ///
    /// Usage:
    ///   var builder = WebApplication.CreateBuilder(args);
    ///   builder.Services.AddUncaught(config => { config.Debug = true; });
    ///   var app = builder.Build();
    ///   app.UseUncaught();
    /// </summary>
    public static WebApplication UseUncaught(
        this WebApplication app,
        Action<UncaughtConfig>? configure = null)
    {
        if (configure != null)
        {
            var config = new UncaughtConfig();
            configure(config);
            UncaughtClient.Init(config);
        }

        app.UseMiddleware<UncaughtMiddleware>();
        return app;
    }
}
