using System.Data;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using System.Security.Cryptography;
using System.Text;
namespace PersonalFinance.Api.Application;
public sealed record ScenarioSourceChange(string SourceId, string Amount);
public sealed record ScenarioChangesInput(ScenarioSourceChange[] Changes, string Explanation);
public sealed record ScenarioCalculateInput(string Currency, string Start, string End, string? AccountId, string? CreditFundingAccountId, bool IncludeLoanPlans = false);
public sealed partial class FinanceService
{
    public async Task<object> SaveScenarioChanges(string user, string id, ScenarioChangesInput input, string? version)
    {
        var row = await db.Set<CashFlowScenario>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "情景不存在");
        Version(row, version); Require(row.State == "Active", "情景已归档");
        Require(input.Changes is { Length: <= 200 } && input.Changes.Select(x => x.SourceId).Distinct().Count() == input.Changes.Length && !string.IsNullOrWhiteSpace(input.Explanation) && input.Explanation.Length <= 2000, "来源必须唯一、最多200项且需要假设说明");
        foreach (var change in input.Changes)
        {
            if (change.SourceId.StartsWith("reserve:") && CurrencyDefinitions.Supports(change.SourceId[8..])) { Require(Money(change.Amount) >= 0, "模拟预留金额不可负"); continue; }
            Require(change.SourceId is { Length: <= 200 } && (change.SourceId.StartsWith("manual:") || change.SourceId.StartsWith("recurring:")), "请使用预测返回的手工或周期来源 ID"); Money(change.Amount);
            var parts = change.SourceId.Split(':');
            if (parts[0] == "manual") Require(parts.Length == 2 && await db.Set<FutureCashFlowItem>().AnyAsync(x => x.UserId == user && x.Id == parts[1] && x.ScenarioId == null && x.Type == "Income" || x.UserId == user && x.Id == parts[1] && x.ScenarioId == null && x.Type == "Expense"), "替换来源必须是本人的基础收支计划");
            else Require(parts.Length >= 3 && await db.RecurringRules.AnyAsync(x => x.UserId == user && x.Id == parts[1]), "周期来源不属于当前用户");
        }
        row.ChangesJson = JsonSerializer.Serialize(input.Changes, Json); row.Note = input.Explanation; row.Version++; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    private static IQueryCollection ScenarioQuery(string id, ScenarioCalculateInput input) => new QueryCollection(new Dictionary<string, StringValues> {
        ["scenarioId"] = id, ["currency"] = input.Currency, ["start"] = input.Start, ["end"] = input.End, ["accountId"] = input.AccountId ?? "", ["creditFundingAccountId"] = input.CreditFundingAccountId ?? "", ["includeLoanPlans"] = input.IncludeLoanPlans ? "true" : "false", ["pageSize"] = "100" });
    private async Task<string> ScenarioSourceHash(string user)
    {
        // Include every mutable projection source, but not audit/session/snapshot rows.
        var sources = new List<object>();
        foreach (var type in new[] { typeof(Account), typeof(FinanceTransaction), typeof(FutureCashFlowItem), typeof(CashFlowScenario), typeof(RecurringRule), typeof(RecurringOccurrence), typeof(Subscription), typeof(SubscriptionPrice), typeof(GoalAllocation), typeof(DebtRepaymentPlan), typeof(DebtPaymentAllocation), typeof(Business) })
        {
            var table = db.Model.FindEntityType(type)!;
            var sql = "SELECT CONVERT(varchar(64), HASHBYTES('SHA2_256', (SELECT * FROM [finance].[" + table.GetTableName() + "] WHERE [UserId] = {0} ORDER BY [Id] FOR JSON PATH)), 2) AS [Value]";
            var rows = await db.Database.SqlQueryRaw<string>(sql, user).ToArrayAsync();
            sources.Add(new { type = type.Name, rows });
        }
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(sources, Json))));
    }
    public async Task<object> SaveScenarioCalculation(string user, string id, ScenarioCalculateInput input, string? version)
    {
        var scenario = await db.Set<CashFlowScenario>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "情景不存在"); Version(scenario, version);
        var result = await ScenarioComparison(user, ScenarioQuery(id, input));
        var row = new ScenarioCalculation { UserId = user, ScenarioId = id, InputJson = JsonSerializer.Serialize(input, Json), ResultJson = JsonSerializer.Serialize(result, Json), SourceHash = await ScenarioSourceHash(user) }; db.Add(row);
        return new { row.Id, result, row.CreatedAt };
    }
    public async Task<object> ScenarioCalculations(string user, string id, IQueryCollection query)
    {
        Require(await db.Set<CashFlowScenario>().AnyAsync(x => x.UserId == user && x.Id == id), "情景不存在");
        var (page, size) = Paging(query); var sourceHash = await ScenarioSourceHash(user);
        var q = db.Set<ScenarioCalculation>().AsNoTracking().Where(x => x.UserId == user && x.ScenarioId == id);
        var rows = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime).ToString("yyyy-MM-dd");
        return new { items = rows.Select(x => new { x.Id, x.CreatedAt, input = JsonSerializer.Deserialize<JsonElement>(x.InputJson), result = JsonSerializer.Deserialize<JsonElement>(x.ResultJson), needsRecalculation = x.SourceHash != sourceHash || JsonSerializer.Deserialize<ScenarioCalculateInput>(x.InputJson, Json)!.Start != today }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> ScenarioComparison(string user, IQueryCollection query)
    {
        Require(!string.IsNullOrWhiteSpace(query["scenarioId"]), "请选择模拟情景");
        // Both projections read the same ledger and plan state; this transaction performs no writes.
        await using var transaction = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable) : null;
        var baselineQuery = new QueryCollection(query.ToDictionary(x => x.Key, x => x.Value));
        var values = baselineQuery.ToDictionary(x => x.Key, x => x.Value);
        values["scenarioId"] = StringValues.Empty;
        var baseline = JsonSerializer.SerializeToNode(await CashFlowForecast(user, new QueryCollection(values)), Json)!;
        var simulation = JsonSerializer.SerializeToNode(await CashFlowForecast(user, query), Json)!;
        decimal Amount(System.Text.Json.Nodes.JsonNode node, string key) => PlanningDecimal(node[key]!.GetValue<string>());
        var differences = new[] { "opening", "inflow", "outflow", "closing", "minimum", "freelyAvailable" }
            .ToDictionary(key => key, key => M(Amount(simulation, key) - Amount(baseline, key)));
        if (transaction != null) await transaction.CommitAsync();
        return new { baseline, simulation, differences, ruleVersion = "cashflow-comparison-v2", explanation = "同一币种、日期和账户范围。差额为模拟减基准；最低余额可能发生在不同日期。按用户指定来源替换普通收支，其余情景事件叠加；不取消合同债务付款。结果不是未来实际承诺。" };
    }
}
