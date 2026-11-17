using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Infrastructure;

namespace PersonalFinance.Api.Application;

// Captured once at startup: replacing the DLL must never make an old process
// claim that it has loaded the replacement build.
public sealed class RuntimeBuild(string assemblyPath)
{
    public string BuildId { get; } = Fingerprint(assemblyPath);

    public bool IsCurrent()
    {
        try { return BuildId == Fingerprint(assemblyPath); }
        catch (IOException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    private static string Fingerprint(string path)
    {
        using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        return Convert.ToHexString(SHA256.HashData(stream));
    }
}

public static class RuntimeHealth
{
    public static void Map(WebApplication app)
    {
        var build = new RuntimeBuild(typeof(RuntimeHealth).Assembly.Location);
        app.MapGet("/api/health", async (FinanceDb db, HttpContext context) =>
        {
            if (!build.IsCurrent())
                return Results.Json(new { status = "unavailable", code = "RUNTIME_OUTDATED", buildId = build.BuildId }, statusCode: 503);

            if (!await db.Database.CanConnectAsync(context.RequestAborted))
                return Results.Json(new { status = "unavailable", code = "DATABASE_UNAVAILABLE", buildId = build.BuildId }, statusCode: 503);

            // Connectivity alone does not mean that the current application can
            // use the schema. This is a read-only check; never migrate on startup.
            var pending = await db.Database.GetPendingMigrationsAsync(context.RequestAborted);
            if (pending.Any())
                return Results.Json(new { status = "unavailable", code = "SCHEMA_OUTDATED", buildId = build.BuildId }, statusCode: 503);

            return Results.Json(new { status = "healthy", code = "READY", buildId = build.BuildId });
        });
    }
}
