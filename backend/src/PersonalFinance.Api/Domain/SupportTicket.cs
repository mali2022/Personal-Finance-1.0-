namespace PersonalFinance.Api.Domain;
public sealed class SupportTicket : Owned
{
    public string Subject { get; set; } = "";
    public string Content { get; set; } = "";
    public string Kind { get; set; } = "Question";
    public string Status { get; set; } = "Open";
    public string Reply { get; set; } = "";
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
