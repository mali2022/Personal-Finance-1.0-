using System.Globalization;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public static (DateTimeOffset start, DateTimeOffset end)? AnniversaryRange(int year, int month, int day)
    {
        if (year < 1900 || year > 9998 || month is < 1 or > 12 || day < 1 || day > DateTime.DaysInMonth(year, month)) return null;
        var start = new DateTimeOffset(year, month, day, 0, 0, 0, TimeSpan.FromHours(8)); return (start, start.AddDays(1));
    }
    private static DateOnly MemoryDate(IQueryCollection query)
    {
        var text = query["date"].ToString(); var date = AssetToday;
        if (text != "") { Require(DateOnly.TryParseExact(text, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date), "日期格式无效"); AssetDate(date); }
        return date;
    }
    private async Task<IQueryable<FinanceTransaction>> MemoryQuery(string user, IQueryCollection query, bool sameDay)
    {
        var date = MemoryDate(query); var cutoff = new DateTimeOffset(AssetToday.Year, 1, 1, 0, 0, 0, TimeSpan.FromHours(8));
        var q = db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Status == "Confirmed" && x.OccurredAt < cutoff);
        var currency = query["currency"].ToString(); if (currency == "") currency = "CNY"; if (currency != "") { AssetCurrency(currency); q = q.Where(x => x.Currency == currency); }
        var yearText = query["years"].ToString(); if (yearText == "") yearText = query["year"].ToString();
        int[] years = [];
        if (yearText != "") { var parts = yearText.Split(','); Require(parts.Length <= 150 && parts.All(v => int.TryParse(v, out var y) && y >= 1900 && y < AssetToday.Year), "历史年份须早于当前年份"); years = parts.Select(int.Parse).Distinct().ToArray(); }
        if (sameDay || years.Length > 0)
        {
            var firstYear = 1900;
            if (years.Length == 0) {
                var first = await q.MinAsync(t => (DateTimeOffset?)t.OccurredAt);
                firstYear = first is null ? AssetToday.Year : Math.Max(1900, first.Value.ToOffset(TimeSpan.FromHours(8)).Year);
            }
            var p = Expression.Parameter(typeof(FinanceTransaction), "t"); Expression predicate = Expression.Constant(false); var occurred = Expression.Property(p, nameof(FinanceTransaction.OccurredAt));
            foreach (var year in years.Length > 0 ? years : Enumerable.Range(firstYear, AssetToday.Year - firstYear))
            {
                var range = sameDay ? AnniversaryRange(year, date.Month, date.Day) : (new DateTimeOffset(year,1,1,0,0,0,TimeSpan.FromHours(8)), new DateTimeOffset(year+1,1,1,0,0,0,TimeSpan.FromHours(8)));
                if (range == null) continue;
                predicate = Expression.OrElse(predicate, Expression.AndAlso(Expression.GreaterThanOrEqual(occurred, Expression.Constant(range.Value.Item1)), Expression.LessThan(occurred, Expression.Constant(range.Value.Item2))));
            }
            q = q.Where(Expression.Lambda<Func<FinanceTransaction, bool>>(predicate, p));
        }
        var type = query["type"].ToString(); Require(type.Length <= 40, "交易类型无效");
        if (type != "" && type != "All") q = q.Where(x => x.Type == type);
        else if (type != "All") { var rules = await Rules(user); q = q.Where(x => x.Entries.Any(e => e.Kind == "Expense") || rules.IncludeAssetLoss && x.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && x.Type == "Adjustment" && x.AdjustmentDirection == "Decrease"); }
        var category = query["categoryId"].ToString(); if (category != "") { var ids = new CategoryHierarchy(await Categories(user)).Descendants(category); q = q.Where(x => x.Entries.Any(e => ids.Contains(e.CategoryId!))); }
        var account = query["accountId"].ToString(); if (account != "") q = q.Where(x => x.AccountId == account || x.Entries.Any(e => e.Kind == "Account" && e.AccountId == account));
        var merchant = query["merchant"].ToString(); var keyword = query["keyword"].ToString(); var tag = query["tagId"].ToString();
        Require(merchant.Length <= 200 && keyword.Length <= 500 && tag.Length <= 36, "筛选条件过长");
        if (merchant != "") q = q.Where(x => x.Merchant != null && x.Merchant.Contains(merchant));
        if (keyword != "") q = q.Where(x => x.Note.Contains(keyword));
        if (tag != "") q = q.Where(x => x.Tags.Any(t => t.DirectoryId == tag));
        return q;
    }
    private sealed record MemoryYear(int Year, string Currency, decimal Income, decimal Expense, decimal Refund, int Count);
    public async Task<object> OnThisDay(string user, IQueryCollection query)
    {
        var date = MemoryDate(query); var q = await MemoryQuery(user, query, true);
        var keys = await q.Select(x => new { x.Currency, x.OccurredAt }).ToArrayAsync();
        var summaries = new List<object>(); var totals = new List<MemoryYear>();
        foreach (var g in keys.GroupBy(x => new { year = x.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Year, x.Currency }).OrderByDescending(x => x.Key.year))
        {
            var range = AnniversaryRange(g.Key.year, date.Month, date.Day)!.Value; var dayQuery = q.Where(x => x.Currency == g.Key.Currency && x.OccurredAt >= range.start && x.OccurredAt < range.end);
            var (income, expense) = await Totals(user, dayQuery);
            var refund = -(await StatisticalExpenses(dayQuery, await Rules(user)).Where(e => e.Amount < 0).SumAsync(e => (decimal?)e.Amount) ?? 0);
            var max = await StatisticalExpenses(dayQuery, await Rules(user)).GroupBy(e => e.TransactionId).Select(g => (decimal?)g.Sum(e => e.Amount)).MaxAsync();
            totals.Add(new(g.Key.year, g.Key.Currency, income, expense, refund, g.Count()));
            summaries.Add(new { g.Key.year, g.Key.Currency, income = M(income), expense = M(expense), refund = M(refund), count = g.Count(), maximumExpense = max > 0 ? M(max.Value) : null, categories = await CategoryStats(user, dayQuery), merchants = await dayQuery.Where(x => x.Merchant != null && x.Merchant != "").GroupBy(x => x.Merchant).Select(g => new { name = g.Key, count = g.Count() }).OrderByDescending(x => x.count).Take(5).ToArrayAsync() });
        }
        var (page, size) = Paging(query);
        var rows = await q.Include(x => x.Tags).OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var tagNames = await db.Directory.Where(x => x.UserId == user && x.Kind == "tags").ToDictionaryAsync(x => x.Id, x => x.Name);
        var merchants = await q.Where(x => x.Merchant != null && x.Merchant != "").GroupBy(x => x.Merchant).Select(g => new { name = g.Key, count = g.Count(), years = g.Select(x => EF.Functions.AtTimeZone(x.OccurredAt, "China Standard Time").Year).Distinct().Count() }).OrderByDescending(x => x.count).Take(10).ToArrayAsync();
        var tags = await (from t in q from tag in t.Tags join d in db.Directory on tag.DirectoryId equals d.Id where d.UserId == user group d by d.Name into g orderby g.Count() descending select new { name = g.Key, count = g.Count() }).Take(10).ToArrayAsync();
        var highest = await StatisticalExpenses(q, await Rules(user)).GroupBy(e => new { e.TransactionId, e.Currency }).Select(g => new { id = g.Key.TransactionId, currency = g.Key.Currency, amount = g.Sum(x => x.Amount) }).Where(x => x.amount > 0).OrderByDescending(x => x.amount).ToArrayAsync();
        return new { date, summaries, aggregates = totals.GroupBy(x => x.Currency).Select(g => new { currency = g.Key, expense = M(g.Sum(x => x.Expense)), income = M(g.Sum(x => x.Income)), refund = M(g.Sum(x => x.Refund)), count = g.Sum(x => x.Count), years = g.Count(), average = M(g.Average(x => x.Expense)), highestYear = g.OrderByDescending(x => x.Expense).ThenByDescending(x => x.Year).First().Year }),
            categories = await CategoryStats(user,q), merchants, tags, highest = highest.GroupBy(x => x.currency).Select(g => new { g.First().id, currency = g.Key, amount = M(g.First().amount) }),
            items = rows.Select(x => new { x.Id, x.Type, x.Currency, amount = M(x.Amount), x.OccurredAt, x.Merchant, x.ProductName, x.Note, tags = x.Tags.Select(t => tagNames.GetValueOrDefault(t.DirectoryId, "已停用标签")), x.CategoryId }), total = keys.Length, page, pageSize = size,
            coveredYears = totals.Select(x => x.Year).Distinct().OrderDescending(), latestYear = totals.Count == 0 ? (int?)null : totals.Max(x => x.Year),
            timeZone = "Asia/Shanghai", coverage = "仅代表已有记录；没有记录不等于零消费", leapRule = "2月29日仅匹配实际闰年的2月29日", rule = "按原币分别统计，复用财务统计规则；本金活动不计入普通消费。" };
    }
    public async Task<object> MemoryCandidate(string user, IQueryCollection query)
    {
        var mode = query["mode"].ToString(); Require(mode is "date" or "year" or "expense" or "merchant" or "nearest", "随机回顾类型无效");
        var q = await MemoryQuery(user, query, mode == "year");
        if (mode == "expense") q = q.Where(x => x.Type == "Expense");
        if (mode == "merchant") {
            var names = q.Where(x => x.Merchant != null && x.Merchant != "").Select(x => x.Merchant).Distinct();
            var name = await names.OrderBy(x => Guid.NewGuid()).FirstOrDefaultAsync();
            if (name == null) return new { found = false, message = "当前筛选范围没有可回顾的商户记录" };
            q = q.Where(x => x.Merchant == name);
        }
        if (mode is "date" or "nearest") {
            var dates = await q.Select(x => EF.Functions.AtTimeZone(x.OccurredAt, "China Standard Time").Date).Distinct().ToArrayAsync();
            if (dates.Length == 0) return new { found = false, message = "当前筛选范围没有可回顾的历史日期" };
            var groups = dates.GroupBy(x => new { x.Month, x.Day }).ToArray(); var target = MemoryDate(query);
            var chosen = mode == "nearest" ? groups.OrderBy(g => Math.Abs(new DateOnly(2000,g.Key.Month,g.Key.Day).DayNumber - new DateOnly(2000,target.Month,target.Day).DayNumber)).First() : groups[System.Security.Cryptography.RandomNumberGenerator.GetInt32(groups.Length)];
            return new { found = true, date = new DateOnly(target.Year == 0 || !DateTime.IsLeapYear(target.Year) && chosen.Key.Month == 2 && chosen.Key.Day == 29 ? 2000 : target.Year, chosen.Key.Month, chosen.Key.Day).ToString("yyyy-MM-dd"), month = chosen.Key.Month, day = chosen.Key.Day, year = chosen.Max().Year };
        }
        if (mode == "year") {
            var years = await q.Select(x => EF.Functions.AtTimeZone(x.OccurredAt, "China Standard Time").Year).Distinct().ToArrayAsync();
            return years.Length == 0 ? (object)new { found = false, message = "当前月日及筛选范围没有可回顾的历史年份" } : new { found = true, date = MemoryDate(query).ToString("yyyy-MM-dd"), year = years[System.Security.Cryptography.RandomNumberGenerator.GetInt32(years.Length)] };
        }
        var tx = await q.OrderBy(x => Guid.NewGuid()).FirstOrDefaultAsync();
        return tx == null ? (object)new { found = false, message = "当前筛选范围没有可回顾的历史记录" } : new { found = true, date = DateOnly.FromDateTime(tx.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime).ToString("yyyy-MM-dd"), year = tx.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Year, transactionId = tx.Id, merchant = mode == "merchant" ? tx.Merchant : null };
    }
}


