using System.Threading.RateLimiting;

namespace PersonalFinance.Api.Application;

public static class LoginRateLimitPolicy
{
    public static RateLimitPartition<string> Partition(HttpContext context)
    {
        // UseForwardedHeaders runs first and accepts a client address only from a trusted proxy.
        // Reading the request's forwarding headers here would let callers choose their own bucket.
        var address = context.Connection.RemoteIpAddress;
        if (address?.IsIPv4MappedToIPv6 == true) address = address.MapToIPv4();
        return RateLimitPartition.GetFixedWindowLimiter(address?.ToString() ?? "unknown", _ => new()
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        });
    }
}
