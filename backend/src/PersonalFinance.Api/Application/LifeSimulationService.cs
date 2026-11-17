using System.Data;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using Microsoft.Extensions.Caching.Memory;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record LifeSnapshotRequest(string Currency);
public sealed record LifeCompareRequest(string[] Ids);
public sealed record LifeArchive(LifeInput Input, LifeResult Result, JsonElement Snapshot, DateTimeOffset CalculatedAt);
public sealed record LifeSnapshot(DateTimeOffset CapturedAt, string Scope, JsonElement Allocation,
    LifeInput Suggested, string[] Missing);

public sealed partial class FinanceService
{
    private const string LifeScenarioKind = "LifeScenario", LifeRunKind = "LifeRun", LifeSnapshotKind = "LifeSnapshot";
    private static readonly MemoryCache LifeCache = new(new MemoryCacheOptions { SizeLimit = 128 });
    public async Task<object> CreateLifeSnapshot(string user, string currency, CancellationToken ct)
    {
        Require(CurrencyDefinitions.Supports(currency), "币种无效"); ct.ThrowIfCancellationRequested();
        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        var today = DateOnly.FromDateTime(now.DateTime);
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["currency"] = currency, ["date"] = today.ToString("yyyy-MM-dd") });
        // Reuse valuation and de-duplication policy. Do not sum accounts and holdings independently.
        var allocation = JsonSerializer.SerializeToElement(await AssetAllocation(user, query), Json);
        var accounts = await db.Accounts.AsNoTracking().Where(x => x.UserId == user && x.Currency == currency).ToDictionaryAsync(x => x.Id, ct);
        var holds = await db.Set<AccountFundHold>().AsNoTracking().Where(x => x.UserId == user && x.State == "Confirmed" && x.IncludedInBookBalance && x.ReducesAvailable && x.Type != "PendingCredit").ToArrayAsync(ct);
        var deductions = holds.GroupBy(x => x.AccountId).ToDictionary(g => g.Key, g => g.Sum(FundHoldRules.AvailabilityDeduction));
        decimal Amount(JsonElement e, string key) => e.TryGetProperty(key, out var p) && p.ValueKind != JsonValueKind.Null ? Money(p.GetString()) : 0;
        decimal cash = 0;
        var components = allocation.GetProperty("items").EnumerateArray().ToArray();
        foreach (var item in components.Where(x => x.GetProperty("currency").GetString() == currency && x.GetProperty("type").GetString() is "Bank" or "Cash"))
        {
            var id = item.GetProperty("id").GetString()!;
            if (!accounts.TryGetValue(id, out var account) || !AccountKinds.IsLiquid(account.Type) || account.Status != "Active") continue;
            var part = Amount(item, "amount");
            // A term deposit may split this account into principal and liquid remainder.
            // Availability holds apply to the whole account, not twice to its remainder.
            var term = components.FirstOrDefault(x => x.GetProperty("id").GetString() == id + ":term");
            var fullBalance = part + (term.ValueKind == JsonValueKind.Undefined ? 0 : Amount(term, "amount"));
            cash += Math.Max(0, Math.Min(part, fullBalance - deductions.GetValueOrDefault(id)));
        }
        // Allocation carries missing valuations/FX explicitly. No guessed conversion is introduced.
        decimal assets = 0, debt = 0;
        if (allocation.TryGetProperty("items", out var items)) foreach (var item in items.EnumerateArray())
        { var n = Amount(item, "amount"); if (n >= 0) assets += n; else debt -= n; }
        var end = new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, now.Offset);
        var (income, expense) = await Totals(user, Range(user, end.AddMonths(-6), end.AddTicks(-1), currency));
        var doc = new StoredDocument { UserId = user, Kind = LifeSnapshotKind, Name = "Life baseline", ContentType = "application/json" };
        var goals = await db.Set<SavingsGoal>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.State == "Active" && x.TargetDate >= today).OrderBy(x => x.Priority).Take(50).Select(x => new LifeGoal(x.Name, x.Target, x.TargetDate)).ToArrayAsync(ct);
        var suggested = new LifeInput("基准 / Baseline", today, 120, currency, cash, 0, 0, Math.Max(0, assets - cash),
            Math.Max(0, decimal.Round(income / 6, 2)), Math.Max(0, decimal.Round(expense / 6, 2)), 0, 0, 0, 0, 0, 0, 0, [], [], goals,
            "HistoricalSixFullMonthsSuggestion; growth/returns/inflation default zero; assets conservatively restricted; confirm all assumptions", doc.Id, debt);
        var missing = new[] { "CONFIRM_FUTURE_NET_INCOME_AND_EXPENSE", "CLASSIFY_INVESTABLE_VS_RESTRICTED_ASSETS", "LOAN_TERMS_NOT_IMPORTED", "FUTURE_PLANS_NOT_AUTOMATICALLY_IMPORTED", "REVIEW_ALLOCATION_MISSING_VALUATIONS_AND_FX", "SAME_CURRENCY_LIQUID_CASH_ONLY", "HOUSEHOLD_SHARED_SPACES_NOT_INCLUDED" };
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(new LifeSnapshot(now, "Current user's personal ledger only; no shared-space reads", allocation, suggested, missing), Json);
        db.Documents.Add(doc);
        return new { doc.Id, snapshot = JsonSerializer.Deserialize<JsonElement>(doc.Content, Json) };
    }
    private async Task CheckLifeSnapshot(string user, LifeInput b)
    {
        LifeSimulationEngine.Validate(b);
        Require(b.Months <= Math.Clamp(configuration?.GetValue<int?>("LifeSimulator:MaxMonths") ?? 480, 1, 480), "超过系统配置的模拟期限");
        Require(b.SnapshotId != null, "请先建立财务基准快照");
        var doc = await Document(user, b.SnapshotId!, LifeSnapshotKind);
        var snapshot = JsonSerializer.Deserialize<LifeSnapshot>(doc.Content, Json)!;
        Require(snapshot.Suggested.Start == b.Start && snapshot.Suggested.Currency == b.Currency, "起点及币种必须与快照一致");
    }
    public async Task<object> SaveLifeScenario(string user, string? id, LifeInput b, string? version)
    {
        await CheckLifeSnapshot(user, b);
        var doc = id == null ? new StoredDocument { UserId = user, Kind = LifeScenarioKind, ContentType = "application/json" } : await Document(user, id, LifeScenarioKind);
        if (id == null) { Require(version == "0", "新情景版本应为0"); db.Documents.Add(doc); } else { Version(doc, version); doc.Version++; }
        doc.Name = b.Name.Trim(); doc.Content = JsonSerializer.SerializeToUtf8Bytes(b, Json);
        return new { doc.Id, version = doc.Version.ToString() };
    }
    public async Task<object> ListLifeDocuments(string user, bool runs, IQueryCollection query, bool risk = false)
    {
        var (page, size) = Paging(query); var kind = risk ? "LifeRiskReport" : runs ? LifeRunKind : LifeScenarioKind;
        var q = db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == kind);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.Name, x.Version, x.CreatedAt }).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Name, version = x.Version.ToString(), x.CreatedAt }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> LifeDocumentDetail(string user, string id, bool run)
    {
        var doc = await Document(user, id, run ? LifeRunKind : LifeScenarioKind);
        JsonElement? snapshot = null;
        if (!run) { var b = JsonSerializer.Deserialize<LifeInput>(doc.Content, Json)!; var baseline = await Document(user, b.SnapshotId!, LifeSnapshotKind); snapshot = JsonSerializer.Deserialize<JsonElement>(baseline.Content, Json); }
        return new { doc.Id, version = doc.Version.ToString(), content = JsonSerializer.Deserialize<JsonElement>(doc.Content, Json), snapshot };
    }
    public async Task<object> DeleteLifeScenario(string user, string id, string? version)
    { var doc = await Document(user, id, LifeScenarioKind); Version(doc, version); db.Remove(doc); return new { id }; }
    public async Task<object> CalculateLife(string user, LifeInput b, CancellationToken ct)
    {
        await CheckLifeSnapshot(user, b); ct.ThrowIfCancellationRequested();
        var cacheKey = user + ":" + LifeSimulationEngine.Fingerprint(b);
        if (!LifeCache.TryGetValue<LifeResult>(cacheKey, out var result) || result == null) { result = LifeSimulationEngine.Run(b, ct); LifeCache.Set(cacheKey, result, new MemoryCacheEntryOptions { Size = 1, AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(10) }); }
        var snapshot = await Document(user, b.SnapshotId!, LifeSnapshotKind);
        var calculatedAt = DateTimeOffset.UtcNow;
        var doc = new StoredDocument { UserId = user, Kind = LifeRunKind, Name = b.Name, ContentType = "application/json", Content = JsonSerializer.SerializeToUtf8Bytes(new LifeArchive(b, result, JsonSerializer.Deserialize<JsonElement>(snapshot.Content, Json), calculatedAt), Json) };
        ct.ThrowIfCancellationRequested(); db.Documents.Add(doc); return new { doc.Id, result, calculatedAt };
    }
    public async Task<object> CompareLife(string user, string[] ids)
    {
        Require(ids.Length is >= 2 and <= 6 && ids.Distinct().Count() == ids.Length, "比较须选择2至6条不同运行");
        var runs = new List<LifeArchive>();
        foreach (var id in ids) { var doc = await Document(user, id, LifeRunKind); runs.Add(JsonSerializer.Deserialize<LifeArchive>(doc.Content, Json)!); }
        var first = runs[0];
        Require(runs.All(x => x.Input.Start == first.Input.Start && x.Input.Months == first.Input.Months && x.Input.Currency == first.Input.Currency && x.Input.SnapshotId == first.Input.SnapshotId && x.Result.ModelVersion == first.Result.ModelVersion), "比较必须使用同一快照、期限、币种及模型版本");
        return runs.Select((r, i) => new { id = ids[i], r.Input.Name, r.Result, deltaNetWorth = r.Result.FinalNetWorth - first.Result.FinalNetWorth, percent = first.Result.FinalNetWorth > 0 ? (decimal?)((r.Result.FinalNetWorth - first.Result.FinalNetWorth) / first.Result.FinalNetWorth * 100) : null }).ToArray();
    }
    public async Task<object> LifeAiEvidence(string user, string currency)
    {
        var docs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == LifeRunKind).OrderByDescending(x => x.CreatedAt).Take(5).ToArrayAsync();
        return docs.Select(x => (doc: x, run: JsonSerializer.Deserialize<LifeArchive>(x.Content, Json)!)).Where(x => x.run.Input.Currency == currency)
            .Select(x => new { x.doc.Id, x.run.Input.Name, x.run.Input.AssumptionSource, x.run.Input.Start, x.run.Input.Months, x.run.CalculatedAt, x.run.Result.ModelVersion, x.run.Result.Fingerprint, x.run.Result.FinalNetWorth, x.run.Result.MinimumCash, x.run.Result.FirstShortfall, x.run.Result.Warnings, source = "Persisted numerical simulation; personal ledger only; no guaranteed outcome" }).ToArray();
    }
    public async Task<object> LifeAiSimulation(string user, string currency, CancellationToken ct)
    {
        var docs = await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == LifeScenarioKind).OrderByDescending(x => x.CreatedAt).Take(20).ToArrayAsync(ct);
        var input = docs.Select(x => JsonSerializer.Deserialize<LifeInput>(x.Content, Json)!).FirstOrDefault(x => x.Currency == currency);
        Require(input != null, "请先在人生模拟器中保存指定币种的情景（最近20条）");
        await CheckLifeSnapshot(user, input!);
        var r = LifeSimulationEngine.Run(input!, ct);
        return new { scenario = input!.Name, assumptions = input.AssumptionSource, input.Start, end = input.Start.AddMonths(input.Months), input.Currency, r.ModelVersion, r.Fingerprint, r.FinalNetWorth, r.MinimumCash, r.FirstShortfall, r.TotalIncome, r.TotalExpense, r.TotalInterest, r.Goals, r.Warnings, scope = "Latest saved scenario among recent 20, requested date range does not filter. Immutable personal baseline + user assumptions + deterministic result. No ledger write. Do not guarantee outcomes." };
    }
}

public static class LifeSimulationEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/life-simulator/retirement-preview", async (LifeRetirementRequest b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LifeRetirementPreview(FinanceEndpoints.User(c), b, c.RequestAborted))).RequireRateLimiting("life-simulation");
        api.MapPost("/life-simulator/snapshots", async (LifeSnapshotRequest b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreateLifeSnapshot(FinanceEndpoints.User(c), b.Currency, c.RequestAborted), true));
        api.MapGet("/life-simulator/scenarios", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ListLifeDocuments(FinanceEndpoints.User(c), false, c.Request.Query)));
        api.MapGet("/life-simulator/runs", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ListLifeDocuments(FinanceEndpoints.User(c), true, c.Request.Query)));
        api.MapGet("/life-simulator/risk-reports", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ListLifeDocuments(FinanceEndpoints.User(c), true, c.Request.Query, true)));
        api.MapGet("/life-simulator/risk-reports/{id}", async (string id, FinanceService f, HttpContext c) => { var d = await f.Document(FinanceEndpoints.User(c), id, "LifeRiskReport"); return FinanceEndpoints.Ok(c, JsonSerializer.Deserialize<JsonElement>(d.Content, FinanceService.Json)); });
        api.MapGet("/life-simulator/scenarios/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LifeDocumentDetail(FinanceEndpoints.User(c), id, false)));
        api.MapGet("/life-simulator/runs/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LifeDocumentDetail(FinanceEndpoints.User(c), id, true)));
        api.MapPost("/life-simulator/scenarios", async (LifeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveLifeScenario(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/life-simulator/scenarios/{id}", async (string id, LifeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveLifeScenario(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/life-simulator/scenarios/{id}/delete", async (string id, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, new { id }, async () => await f.DeleteLifeScenario(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true));
        api.MapPost("/life-simulator/runs", async (LifeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CalculateLife(FinanceEndpoints.User(c), b, c.RequestAborted), true));
        api.MapPost("/life-simulator/compare", async (LifeCompareRequest b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CompareLife(FinanceEndpoints.User(c), b.Ids)));
        api.MapPost("/life-simulator/sensitivity", async (LifeSensitivityInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LifeSensitivity(FinanceEndpoints.User(c), b, c.RequestAborted))).RequireRateLimiting("life-simulation");
        api.MapPost("/life-simulator/monte-carlo", async (LifeMonteCarloInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.LifeMonteCarlo(FinanceEndpoints.User(c), b, c.RequestAborted), true)).RequireRateLimiting("life-simulation");
    }
}
