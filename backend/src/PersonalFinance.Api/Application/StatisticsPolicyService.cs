using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> StatisticsPolicyHistory(string user)
    {
        var rows = await db.AuditRecords.AsNoTracking()
            .Where(x => x.UserId == user && x.ResourceType == nameof(StatisticsRules))
            .OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Take(50).ToArrayAsync();
        return rows.Select(x => new { x.Id, x.CreatedAt, x.Source,
            changes = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(x.ChangesJson, Json) });
    }

    // Read-only: evaluate a proposed policy against exactly the same ledger as reports.
    public async Task<object> PreviewStatisticsPolicy(string user, string month, string currency, RulesInput proposed)
    {
        Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var (start, end) = Month(month);
        var range = Range(user, start, end, currency);
        var current = await Rules(user);
        var income = -(await (from e in db.Entries join t in range on e.TransactionId equals t.Id
            where e.Kind == "Income" select (decimal?)e.Amount).SumAsync() ?? 0);
        var withoutFees = new StatisticsRules { IncludeFees = false };
        var baseExpense = await StatisticalExpenses(range, withoutFees).SumAsync(e => (decimal?)e.Amount) ?? 0;
        var allExpense = await StatisticalExpenses(range, new StatisticsRules { IncludeFees = true }).SumAsync(e => (decimal?)e.Amount) ?? 0;
        var fees = allExpense - baseExpense;
        var loss = await range.Where(t => t.Type == "AssetLoss").SumAsync(t => (decimal?)t.Amount) ?? 0;
        var adjustments = await range.Where(t => t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease").SumAsync(t => (decimal?)t.Amount) ?? 0;
        decimal Expense(bool fee, bool assetLoss, bool adjustment) => baseExpense + (fee ? fees : 0) + (assetLoss ? loss : 0) + (adjustment ? adjustments : 0);
        var before = Expense(current.IncludeFees, current.IncludeAssetLoss, current.IncludeDecreasingAdjustments);
        var after = Expense(proposed.IncludeFees, proposed.IncludeAssetLoss, proposed.IncludeDecreasingAdjustments);
        return new { month, currency, version = current.Version.ToString(), transactionCount = await range.CountAsync(),
            income = M(income), baseExpense = M(baseExpense), fees = M(fees), assetLoss = M(loss), decreasingAdjustments = M(adjustments),
            currentExpense = M(before), proposedExpense = M(after), expenseDifference = M(after - before),
            currentSurplus = M(income - before), proposedSurplus = M(income - after) };
    }
}
