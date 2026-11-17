namespace PersonalFinance.Api.Domain;

// Sharing is explicit and does not grant access to members' private accounts.
public sealed class FinanceSpace : Owned
{
    public string Kind { get; set; } = "Book";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public int SortOrder { get; set; }
    public bool Archived { get; set; }
    public string? FamilyId { get; set; }
}
public sealed class SpaceMember : Owned
{
    public string SpaceId { get; set; } = "";
    public string? LinkedUserId { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "Viewer";
    public string Profile { get; set; } = "";
    public bool Active { get; set; } = true;
}
public sealed class SpaceInvitation : Owned
{
    public string SpaceId { get; set; } = "";
    public string Email { get; set; } = "";
    public string Role { get; set; } = "Viewer";
    public string State { get; set; } = "Pending";
    public DateTimeOffset ExpiresAt { get; set; } = DateTimeOffset.UtcNow.AddDays(7);
}
public sealed class SharedTransaction : Owned
{
    public string TransactionId { get; set; } = "";
    public string BookId { get; set; } = "";
    public string? ConsumerId { get; set; }
    public string? PayerId { get; set; }
    public string Rule { get; set; } = "Equal";
    public string SharesJson { get; set; } = "[]";
    public string InputsJson { get; set; } = "[]";
}
public sealed class SpaceBudget : Owned
{
    public string SpaceId { get; set; } = "";
    public string Month { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Amount { get; set; }
}
public sealed class SpaceSettlement : Owned
{
    public string SpaceId { get; set; } = "";
    public string FromMemberId { get; set; } = "";
    public string ToMemberId { get; set; } = "";
    public string Currency { get; set; } = "CNY";
    public decimal Amount { get; set; }
    public string Note { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public bool Revoked { get; set; }
}
