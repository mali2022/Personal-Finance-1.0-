using PersonalFinance.Api.Contracts;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record SpendingDecision(string Name, string Currency, DateOnly Start, DateOnly End, string[] Dimensions, SpendingInput Input, SpendingReview[] Reviews);
public sealed record SpendingReview(string OptionId, string[] TransactionIds, int Uses, decimal Satisfaction, string Notes, string[]? AssetIds = null, string[]? TimeIds = null);
public sealed partial class FinanceService
{
    const string SpendingKind = "SpendingValueDecision";
    public async Task<object> SpendingChoices(string user, string currency, string? keyword)
    {
        Require(CurrencyDefinitions.Supports(currency) && (keyword?.Length ?? 0) <= 100, "查询参数无效");
        var q = db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.Type == "Expense" && x.Status == "Confirmed");
        if (!string.IsNullOrWhiteSpace(keyword)) q = q.Where(x => x.Id == keyword || x.Note.Contains(keyword) || x.Merchant != null && x.Merchant.Contains(keyword));
        return new { transactions = await q.OrderByDescending(x => x.OccurredAt).Take(50).Select(x => new { x.Id, x.Note, x.Amount, x.OccurredAt }).ToArrayAsync(),
            assets = await db.Set<ManagedAsset>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.Type != "TermDeposit").OrderBy(x => x.Name).Take(100).Select(x => new { x.Id, x.Name }).ToArrayAsync(),
            times = await db.Set<TimeActivity>().AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.CreatedAt).Take(100).Select(x => new { x.Id, name = x.Title }).ToArrayAsync() };
    }
    public async Task<object> SpendingList(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query);
        var q = db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == SpendingKind);
        return new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page-1)*size).Take(size).Select(x => new { x.Id, x.Name, version = x.Version.ToString() }).ToArrayAsync(), total = await q.CountAsync() };
    }
    public async Task<object> SpendingDetail(string user, string id)
    {
        var d = await Document(user, id, SpendingKind);
        var b = JsonSerializer.Deserialize<SpendingDecision>(d.Content, Json)!;
        var ids = b.Reviews.SelectMany(r => r.TransactionIds).Distinct().ToArray();
        var actual = await db.Transactions.AsNoTracking().Where(t => t.UserId == user && ids.Contains(t.Id) && t.Status == "Confirmed" && t.Type == "Expense" && t.Currency == b.Currency).Select(t => new { t.Id, t.Amount }).ToArrayAsync();
        return new { d.Id, version = d.Version.ToString(), input = b, result = SpendingValueMath.Compare(b.Input), reviews = b.Reviews.Select(r => new { review = r, actualCost = r.TransactionIds.Any(id => !actual.Any(t => t.Id == id)) ? (decimal?)null : actual.Where(t => r.TransactionIds.Contains(t.Id)).Sum(t => t.Amount), missing = r.TransactionIds.Except(actual.Select(t => t.Id)), expectedCost = b.Input.Options.First(o => o.Id == r.OptionId).Items.Sum(i => i.Amount + i.FollowUpCost) }) };
    }
    public async Task<object> SaveSpending(string user, string? id, SpendingDecision b, string? version)
    {
        Require(b.Name.Length is > 0 and <= 100 && CurrencyDefinitions.Supports(b.Currency) && b.End >= b.Start && b.End.DayNumber-b.Start.DayNumber <= 3660, "名称、币种或比较期限无效");
        Require(b.Dimensions.Length == b.Input.Weights.Length && b.Dimensions.All(d => !string.IsNullOrWhiteSpace(d) && d.Length <= 50) && b.Reviews.Length <= 50, "维度或复盘无效");
        try { SpendingValueMath.Compare(b.Input); } catch (ArgumentException) { throw new ApiException(400, "方案参数无效"); }
        Require(b.Reviews.Select(r => r.OptionId).Distinct().Count() == b.Reviews.Length, "每个方案只允许一条复盘");
        foreach (var r in b.Reviews)
        {
            Require(b.Input.Options.Any(o => o.Id == r.OptionId) && r.Uses >= 0 && r.Satisfaction is >= 0 and <= 10 && r.Notes.Length <= 2000 && r.TransactionIds.Length <= 100, "复盘无效");
            var assets = r.AssetIds ?? []; var times = r.TimeIds ?? [];
            Require(assets.Length <= 100 && times.Length <= 100 && assets.Distinct().Count() == assets.Length && times.Distinct().Count() == times.Length, "关联记录重复或过多");
            Require(await db.Set<ManagedAsset>().CountAsync(x => x.UserId == user && assets.Contains(x.Id) && x.Type != "TermDeposit") == assets.Length && await db.Set<TimeActivity>().CountAsync(x => x.UserId == user && times.Contains(x.Id)) == times.Length, "关联资产或时间记录不存在");
            var ids = r.TransactionIds.Distinct().ToArray();
            Require(ids.Length == r.TransactionIds.Length && await db.Transactions.CountAsync(t => t.UserId == user && ids.Contains(t.Id) && t.Currency == b.Currency && t.Status == "Confirmed" && t.Type == "Expense") == ids.Length, "关联交易不存在、币种不符或无权访问");
        }
        var d = id == null ? new StoredDocument { UserId = user, Kind = SpendingKind, ContentType = "application/json" } : await Document(user, id, SpendingKind);
        if (id == null) { Require(version == "0", "新方案版本应为0"); db.Add(d); } else { Version(d, version); d.Version++; }
        d.Name = b.Name; d.Content = JsonSerializer.SerializeToUtf8Bytes(b, Json);
        db.Add(new AuditRecord { UserId = user, ResourceType = SpendingKind, ResourceId = d.Id, Action = id == null ? "Create" : "Update", ChangesJson = "{}" });
        return new { d.Id, version = d.Version.ToString() };
    }
}
public static class SpendingValueEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        SpendingIntelligenceEndpoints.Map(api);
        api.MapGet("/spending-value/choices", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SpendingChoices(FinanceEndpoints.User(c), c.Request.Query["currency"].FirstOrDefault() ?? "CNY", c.Request.Query["keyword"].FirstOrDefault())));
        api.MapPost("/spending-value/sensitivity", (SpendingInput b, HttpContext c) => { try { return FinanceEndpoints.Ok(c, SpendingValueMath.Sensitivity(b)); } catch (ArgumentException) { throw new ApiException(400, "方案参数无效"); } });
        api.MapPost("/spending-value/compare", (SpendingInput b, HttpContext c) => { try { return FinanceEndpoints.Ok(c, SpendingValueMath.Compare(b)); } catch (ArgumentException) { throw new ApiException(400, "方案参数无效"); } });
        api.MapGet("/spending-value", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SpendingList(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/spending-value/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SpendingDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/spending-value", async (SpendingDecision b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveSpending(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/spending-value/{id}", async (string id, SpendingDecision b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveSpending(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
    }
}


