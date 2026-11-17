namespace PersonalFinance.Api.Domain;
public sealed class Invitation
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string TokenHash { get; set; } = "";
    public string? BoundEmail { get; set; }
    public string CreatedByUserId { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public string? UsedByUserId { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
    public long Version { get; set; } = 1;
}
