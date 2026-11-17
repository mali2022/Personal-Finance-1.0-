using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record ApprovalSettings(string Style, string Currency, decimal? EmergencyReserve, string Preferences);
public sealed partial class FinanceService
{
    public async Task<object> ApprovalGetSettings(string user)
    {
        var d = await db.Documents.SingleOrDefaultAsync(x => x.UserId == user && x.Kind == "SpendingApprovalSettings");
        return new { version = d?.Version.ToString() ?? "0", settings = d == null ? new ApprovalSettings("Balanced", "CNY", null, "") : JsonSerializer.Deserialize<ApprovalSettings>(d.Content, Json) };
    }
    public async Task<object> ApprovalSaveSettings(string user, ApprovalSettings b, string? version)
    {
        Require(b.Style is "Balanced" or "Strict" or "Supportive" && CurrencyDefinitions.Supports(b.Currency) && b.Preferences.Length <= 4000 && (b.EmergencyReserve == null || b.EmergencyReserve is >= 0 and <= 1_000_000_000_000m && decimal.Round(b.EmergencyReserve.Value, 2) == b.EmergencyReserve), "审批设置无效");
        var d = await db.Documents.SingleOrDefaultAsync(x => x.UserId == user && x.Kind == "SpendingApprovalSettings");
        if (d == null) { Require(version == "0", "设置已变更"); d = new StoredDocument { UserId = user, Kind = "SpendingApprovalSettings", Name = "Approval preferences", ContentType = "application/json" }; db.Add(d); }
        else { Version(d, version); d.Version++; }
        d.Content = JsonSerializer.SerializeToUtf8Bytes(b, Json); ApprovalAudit(user, d.Id, "Settings"); return new { version = d.Version.ToString(), settings = b };
    }
}
