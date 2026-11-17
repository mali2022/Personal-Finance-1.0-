using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private const string StatisticsManagementKind = "StatisticsManagementPolicy";
    public static void ValidateStatisticsManagement(StatisticsManagementOptions options)
    {
        Require(options.Mode is "Everyday" or "Assets" or "Comprehensive" or "Custom", "统计方案无效");
        Require(CurrencyDefinitions.Supports(options.BaseCurrency), "统计基准货币无效");
        Require(options.MonthStartDay is >= 1 and <= 31 && options.YearStartMonth is >= 1 and <= 12 && options.WeekStartsOn is >= 1 and <= 7, "统计账期设置无效");
        Require(options.RefundDisplay is "Net" or "Separate" && options.PayrollBasis is "Net" or "Gross" && options.PayrollTimeBasis is "Paid" or "Earned", "统计口径选项无效");
        Require(Money(options.LargeTransactionThreshold) > 0 && Money(options.LargeTransactionThreshold) <= 1000000000, "大额交易阈值须大于0且不超过十亿");
    }

    public static (DateTimeOffset start, DateTimeOffset end) StatisticsManagementPeriod(StatisticsManagementOptions options, string anchor, string period)
    {
        ValidateStatisticsManagement(options);
        Require(DateOnly.TryParseExact(anchor, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) && day.Year is >= 1901 and <= 9997, "统计日期无效");
        DateOnly Boundary(int year, int month) => new(year, month, Math.Min(options.MonthStartDay, DateTime.DaysInMonth(year, month)));
        DateOnly start, end;
        if (period == "month")
        {
            start = Boundary(day.Year, day.Month);
            if (start > day) { var prior = new DateOnly(day.Year, day.Month, 1).AddMonths(-1); start = Boundary(prior.Year, prior.Month); }
            var next = new DateOnly(start.Year, start.Month, 1).AddMonths(1); end = Boundary(next.Year, next.Month);
        }
        else if (period == "year")
        {
            start = new DateOnly(day.Year, options.YearStartMonth, 1);
            if (start > day) start = start.AddYears(-1);
            end = start.AddYears(1);
        }
        else if (period == "week")
        {
            var weekday = day.DayOfWeek == DayOfWeek.Sunday ? 7 : (int)day.DayOfWeek;
            start = day.AddDays(-(weekday - options.WeekStartsOn + 7) % 7); end = start.AddDays(7);
        }
        else throw new ApiException(422, "统计周期无效");
        return (new(start.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)), new(end.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)));
    }

    public async Task<object> StatisticsManagement(string user)
    {
        var doc = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Kind == StatisticsManagementKind);
        var options = doc == null ? new StatisticsManagementOptions() : JsonSerializer.Deserialize<StatisticsManagementOptions>(doc.Content, Json)!;
        var rules = await Rules(user);
        return new { options, ledgerRules = new RulesInput(rules.IncludeFees, rules.IncludeAssetLoss, rules.IncludeDecreasingAdjustments),
            ledgerVersion = rules.Version.ToString(), version = doc?.Version.ToString() ?? "0", schemaVersion = 1 };
    }

    public async Task<object> SaveStatisticsManagement(string user, StatisticsManagementInput input, string? version)
    {
        ValidateStatisticsManagement(input.Options);
        var doc = await db.Documents.SingleOrDefaultAsync(x => x.UserId == user && x.Kind == StatisticsManagementKind);
        var rules = await db.Rules.SingleOrDefaultAsync(x => x.UserId == user);
        if (doc == null) Require(version == "0", "统计方案版本已变化，请刷新后重试"); else Version(doc, version);
        if (rules == null) Require(input.LedgerVersion == "1", "统计规则版本无效"); else Version(rules, input.LedgerVersion);
        var previous = doc == null ? new StatisticsManagementOptions() : JsonSerializer.Deserialize<StatisticsManagementOptions>(doc.Content, Json)!;
        if (doc == null) { doc = new StoredDocument { Id = new Guid(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(StatisticsManagementKind + user)).AsSpan(0, 16)).ToString(), UserId = user, Kind = StatisticsManagementKind, Name = "Statistics policy", ContentType = "application/json" }; db.Documents.Add(doc); }
        else doc.Version++;
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(input.Options, Json);
        // A deterministic identity also prevents two concurrent first saves from creating two policies.
        if (rules == null) { rules = new StatisticsRules { UserId = user }; db.Rules.Add(rules); }
        rules.IncludeFees = input.LedgerRules.IncludeFees; rules.IncludeAssetLoss = input.LedgerRules.IncludeAssetLoss;
        rules.IncludeDecreasingAdjustments = input.LedgerRules.IncludeDecreasingAdjustments; rules.Version++;
        var before = JsonSerializer.SerializeToElement(previous, Json);
        var after = JsonSerializer.SerializeToElement(input.Options, Json);
        var changes = after.EnumerateObject().Where(p => before.GetProperty(p.Name).GetRawText() != p.Value.GetRawText())
            .Select(p => new { field = p.Name, before = before.GetProperty(p.Name), after = p.Value }).ToArray();
        db.AuditRecords.Add(new AuditRecord { UserId = user, ResourceType = StatisticsManagementKind, ResourceId = doc.Id,
            Action = "Update", ChangesJson = JsonSerializer.Serialize(changes, Json) });
        return new { version = doc.Version.ToString(), ledgerVersion = rules.Version.ToString() };
    }

    public async Task<object> StatisticsManagementHistory(string user)
    {
        var rows = await db.AuditRecords.AsNoTracking().Where(x => x.UserId == user && (x.ResourceType == StatisticsManagementKind || x.ResourceType == nameof(StatisticsRules)))
            .OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(50).ToArrayAsync();
        return rows.Select(x => new { x.Id, x.ResourceType, x.CreatedAt, changes = JsonSerializer.Deserialize<JsonElement>(x.ChangesJson, Json) });
    }
}
