using System.Globalization;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace PersonalFinance.Api.Application;

public sealed record ReportPeriod(int Index, DateTimeOffset Start, DateTimeOffset End);
public sealed record ReportTransactionPeriod(string Id, int Index);

public sealed partial class FinanceService
{
    public static List<ReportPeriod> ReportPeriods(DateTimeOffset start, DateTimeOffset end, string granularity)
    {
        Require(end >= start && new[] { "day", "week", "month", "year" }.Contains(granularity), "统计时间范围或粒度无效");
        var cursor = start.ToOffset(TimeSpan.FromHours(8));
        var max = granularity == "day" ? 370 : 600;
        var periods = new List<ReportPeriod>();
        while (cursor <= end && periods.Count < max)
        {
            // A singleton interval needs no successor (which may exceed year 9999).
            if (cursor == end)
            {
                periods.Add(new(periods.Count, cursor, end));
                return periods;
            }
            DateTimeOffset next;
            try { next = granularity switch { "day" => cursor.AddDays(1), "week" => cursor.AddDays(7), "year" => cursor.AddYears(1), _ => cursor.AddMonths(1) }; }
            catch (ArgumentOutOfRangeException)
            {
                periods.Add(new(periods.Count, cursor, end));
                return periods;
            }
            periods.Add(new(periods.Count, cursor, next > end ? end : next.AddTicks(-1)));
            cursor = next;
        }
        Require(cursor > end, "该时间范围过长，请使用更粗的统计粒度");
        return periods;
    }

    // Every instant belongs to one contiguous period. A parameterized CASE avoids
    // a range cross join between every transaction and every requested period.
    private IQueryable<ReportTransactionPeriod> PeriodRelation(string user, List<ReportPeriod> periods)
    {
        var parameters = new List<object>
        {
            new SqlParameter("@reportUser", user),
            new SqlParameter("@reportStart", periods[0].Start),
            new SqlParameter("@reportEnd", periods[^1].End)
        };
        var clauses = new List<string>();
        foreach (var period in periods.SkipLast(1))
        {
            var name = "@reportBoundary" + period.Index.ToString(CultureInfo.InvariantCulture);
            parameters.Add(new SqlParameter(name, period.End));
            clauses.Add($"WHEN [OccurredAt] <= {name} THEN {period.Index.ToString(CultureInfo.InvariantCulture)}");
        }
        var bucket = clauses.Count == 0 ? "0" : $"CASE {string.Join(' ', clauses)} ELSE {(periods.Count - 1).ToString(CultureInfo.InvariantCulture)} END";
        var sql = $"SELECT [Id], {bucket} AS [Index] FROM [finance].[Transactions] WHERE [UserId] = @reportUser AND [Status] <> N'Deleted' AND [OccurredAt] >= @reportStart AND [OccurredAt] <= @reportEnd";
        return db.Database.SqlQueryRaw<ReportTransactionPeriod>(sql, parameters.ToArray());
    }

    private sealed record ReportPoint(string Period, string Income, string Expense, string Assets, string Liabilities, string NetWorth);

    private async Task<List<ReportPoint>> AggregateReportPoints(string user, DateTimeOffset start, DateTimeOffset end, string currency, string granularity, string? project, string[]? accountIds = null)
    {
        var periods = ReportPeriods(start, end, granularity);
        var windows = PeriodRelation(user, periods);
        var transactions = Range(user, start, end, currency, project, accountIds);
        var rules = await Rules(user);
        var includeFees = rules.IncludeFees;
        var sums = await (from e in db.Entries
                          join t in transactions on e.TransactionId equals t.Id
                          join w in windows on t.Id equals w.Id
                          where (e.Kind == "Expense" || e.Kind == "Income") && (accountIds==null || accountIds.Contains(e.AccountId??t.AccountId))
                          group new { e, t } by w.Index into g
                          select new
                          {
                              Index = g.Key,
                              Income = -g.Sum(x => x.e.Kind == "Income" ? x.e.Amount : 0),
                              Expense = g.Sum(x => x.e.Kind == "Expense" && (includeFees || (x.t.FeeCategoryId == null || x.e.CategoryId != x.t.FeeCategoryId)) ? x.e.Amount : 0)
                          }).ToDictionaryAsync(x => x.Index);

        var extra = new Dictionary<int, decimal>();
        if (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments)
        {
            var includeLoss = rules.IncludeAssetLoss;
            var includeAdjustments = rules.IncludeDecreasingAdjustments;
            extra = await (from t in transactions join w in windows on t.Id equals w.Id
                           where includeLoss && t.Type == "AssetLoss" || includeAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease"
                           group t by w.Index into g
                           select new { Index = g.Key, Amount = g.Sum(t => t.Amount) }).ToDictionaryAsync(x => x.Index, x => x.Amount);
        }

        // Net worth is global for the chosen currency, even when spending is project-filtered.
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.UserId == user && a.Currency == currency && (accountIds == null || accountIds.Contains(a.Id))).ToListAsync();
        var accountEntries = from e in db.Entries
                             join t in db.Transactions on e.TransactionId equals t.Id
                             join a in db.Accounts on e.AccountId equals a.Id
                             where e.UserId == user && t.UserId == user && e.Kind == "Account" && t.Status != "Deleted" && a.UserId == user && a.Currency == currency && (accountIds == null || accountIds.Contains(a.Id))
                             select new { e.AccountId, e.Amount, t.OccurredAt, t.Id };
        var opening = await accountEntries.Where(x => x.OccurredAt < start).GroupBy(x => x.AccountId!)
            .Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
        var changes = await (from e in accountEntries join w in windows on e.Id equals w.Id
                             group e by new { w.Index, e.AccountId } into g
                             select new { g.Key.Index, Id = g.Key.AccountId!, Amount = g.Sum(x => x.Amount) }).ToListAsync();
        var byPeriod = changes.ToLookup(x => x.Index);
        var balances = accounts.ToDictionary(a => a.Id, a => a.OpeningBalance + opening.GetValueOrDefault(a.Id));
        var points = new List<ReportPoint>();
        foreach (var w in periods)
        {
            foreach (var change in byPeriod[w.Index]) balances[change.Id] += change.Amount;
            var income = sums.TryGetValue(w.Index, out var sum) ? sum.Income : 0;
            var expense = (sum?.Expense ?? 0) + extra.GetValueOrDefault(w.Index);
            points.Add(new(
                w.Start.ToString(granularity == "year" ? "yyyy" : granularity == "month" ? "yyyy-MM" : "yyyy-MM-dd", CultureInfo.InvariantCulture),
                M(income), M(expense),
                M(balances.Values.Where(x => x > 0).Sum()),
                M(-balances.Values.Where(x => x < 0).Sum()), M(balances.Values.Sum())));
        }
        return points;
    }
}
