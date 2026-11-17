using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static int AnalysisYear(IQueryCollection query)
    {
        var text = query["year"].ToString(); var year = AssetToday.Year;
        if (text != "") Require(int.TryParse(text, out year) && year is >= 1900 and <= 9998, "年份无效"); return year;
    }
    public async Task<object> PayrollSummary(string user, IQueryCollection query)
    {
        var year = AnalysisYear(query); var currency = query["currency"].ToString(); if (currency == "") currency = "CNY"; AssetCurrency(currency);
        var start = $"{year - 1:0000}-01"; var end = $"{year:0000}-12";
        var statements = await db.Set<PayrollStatement>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && string.Compare(x.Month, start) >= 0 && string.Compare(x.Month, end) <= 0 && x.State != "Cancelled").ToArrayAsync();
        var ids = statements.Select(x => x.Id).ToArray(); var components = await db.Set<PayrollComponent>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.PayrollId)).ToArrayAsync();
        var payments = await (from link in db.Set<PayrollPayment>() join tx in db.Transactions on link.TransactionId equals tx.Id where link.UserId == user && ids.Contains(link.PayrollId) && tx.Status != "Deleted" select new { link.PayrollId, tx.Amount, tx.OccurredAt }).ToArrayAsync();
        var rows = new List<object>(); decimal totalGross = 0, totalNet = 0, totalActual = 0, totalDeduction = 0;
        for (var month = 1; month <= 12; month++)
        {
            var key = $"{year:0000}-{month:00}"; var group = statements.Where(x => x.Month == key).ToArray(); var groupIds = group.Select(x => x.Id).ToHashSet();
            var totals = PayrollMath.Calculate(components.Where(x => groupIds.Contains(x.PayrollId))); var actual = payments.Where(x => groupIds.Contains(x.PayrollId)).Sum(x => x.Amount);
            var previousIds = statements.Where(x => x.Month == $"{year - 1:0000}-{month:00}").Select(x => x.Id).ToHashSet(); var previous = PayrollMath.Calculate(components.Where(x => previousIds.Contains(x.PayrollId)));
            var priorMonth = new DateOnly(year, month, 1).AddMonths(-1).ToString("yyyy-MM"); var priorMonthIds = statements.Where(x => x.Month == priorMonth).Select(x => x.Id).ToHashSet(); var priorMonthTotals = PayrollMath.Calculate(components.Where(x => priorMonthIds.Contains(x.PayrollId)));
            totalGross += totals.gross; totalNet += totals.net; totalDeduction += totals.deduction; totalActual += actual;
            rows.Add(new { month = key, gross = M(totals.gross), deduction = M(totals.deduction), net = M(totals.net), actual = M(actual), difference = M(actual - totals.net), count = group.Length,
                confirmedCount = group.Count(x => x.State == "Confirmed"), draftCount = group.Count(x => x.State == "Draft"),
                yearOverYearNetPercent = previous.net <= 0 || previousIds.Count == 0 || group.Length == 0 ? null : D((totals.net - previous.net) / previous.net * 100),
                monthOverMonthNetPercent = priorMonthTotals.net <= 0 || priorMonthIds.Count == 0 || group.Length == 0 ? null : D((totals.net - priorMonthTotals.net) / priorMonthTotals.net * 100),
                sample = group.Length == 0 ? "暂无工资条记录" : "工资所属期口径；包括标明的草稿，到账仅取关联真实收入" });
        }
        var componentStructure = components.Where(x => statements.Any(p => p.Id == x.PayrollId && p.Month.StartsWith(year.ToString()))).GroupBy(x => new { x.Kind, x.Name }).Select(g => new { g.Key.Kind, g.Key.Name, amount = M(g.Sum(x => x.Amount)),
            months = g.GroupBy(x => statements.Single(p => p.Id == x.PayrollId).Month).OrderBy(x => x.Key).Select(month => new { month = month.Key, amount = M(month.Sum(x => x.Amount)) }) });
        return new { year, currency, gross = M(totalGross), deduction = M(totalDeduction), net = M(totalNet), actual = M(totalActual), difference = M(totalActual - totalNet), rows, componentStructure,
            rule = "应发/扣款/实发属于工资条分析，不叠加普通现金收入；实际到账按关联收入金额展示，归入工资所属期；未关联流水不猜测。同比缺少样本或前期非正时不可计算。" };
    }
    public async Task<object> ContributionSummary(string user, IQueryCollection query)
    {
        var year = AnalysisYear(query); var currency = query["currency"].ToString(); if (currency == "") currency = "CNY"; AssetCurrency(currency);
        var prefix = $"{year:0000}-"; var housing = query["kind"].ToString() == "HousingFund";
        var records = await db.Set<SocialContributionRecord>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.Month.StartsWith(prefix) && (housing ? x.Kind == "HousingFund" : x.Kind != "HousingFund") && x.State != "Cancelled").ToArrayAsync();
        var confirmed = records.Where(x => x.State == "Confirmed").ToArray(); var maxMonth = year == AssetToday.Year ? AssetToday.Month : year < AssetToday.Year ? 12 : 0;
        var cumulative = housing ? await db.Set<SocialContributionRecord>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.Kind == "HousingFund" && x.State == "Confirmed" && string.Compare(x.Month, $"{year:0000}-12") <= 0).ToArrayAsync() : [];
        return new { year, currency, personal = M(confirmed.Sum(x => x.PersonalAmount)), employer = M(confirmed.Sum(x => x.EmployerAmount)),
            cumulativePersonal = housing ? M(cumulative.Sum(x => x.PersonalAmount)) : null, cumulativeEmployer = housing ? M(cumulative.Sum(x => x.EmployerAmount)) : null,
            cumulativeRule = housing ? "截至所选年末的已记录、已确认缴费累计；不等于账户余额，不补造此前缺失资料。" : null,
            rows = records.GroupBy(x => x.Month).OrderBy(x => x.Key).Select(g => new { month = g.Key,
                personal = M(g.Where(x => x.State == "Confirmed").Sum(x => x.PersonalAmount)), employer = M(g.Where(x => x.State == "Confirmed").Sum(x => x.EmployerAmount)),
                pendingPersonal = M(g.Where(x => x.State == "Pending").Sum(x => x.PersonalAmount)), supplementaryCount = g.Count(x => x.Supplementary),
                basis = g.Select(x => new { x.Id, x.Kind, basis = M(x.Basis), personalRatePercent = x.Basis > 0 ? D(x.PersonalAmount / x.Basis * 100) : null, employerRatePercent = x.Basis > 0 ? D(x.EmployerAmount / x.Basis * 100) : null }) }),
            missingMonths = Enumerable.Range(1, maxMonth).Select(x => $"{year:0000}-{x:00}").Where(x => !records.Any(r => r.Month == x)),
            balanceHistory = housing ? records.Where(x => x.ReportedBalance != null).OrderBy(x => x.PaidDate).Select(x => new { x.Id, date = x.PaidDate, balance = M(x.ReportedBalance!.Value), x.BalanceSource, x.AccountId }).ToArray() : null,
            rule = "缺失月份只表示没有缴费记录，不能断言未缴费；比率由实际基数和金额计算，不推断当地政策。余额历史为明确来源的核对记录，不另计净资产。" };
    }
    public async Task<object> HousingWithdrawals(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var year = AnalysisYear(query); var currency = query["currency"].ToString(); if (currency == "") currency = "CNY"; AssetCurrency(currency);
        var start = new DateTimeOffset(year, 1, 1, 0, 0, 0, TimeSpan.FromHours(8)); var end = start.AddYears(1);
        var accounts = db.Set<SocialContributionRecord>().Where(x => x.UserId == user && x.Kind == "HousingFund" && x.State != "Cancelled" && x.AccountId != null).Select(x => x.AccountId!);
        var q = db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && x.OccurredAt >= start && x.OccurredAt < end && x.Type == "Transfer" && x.Status == "Confirmed" && accounts.Contains(x.AccountId!));
        var rows = await q.OrderByDescending(x => x.OccurredAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.AccountId, x.ToAccountId, x.Currency, amount = M(x.Amount), x.OccurredAt }), total = await q.CountAsync(), page, pageSize = size,
            rule = "只读展示已明确关联公积金账户的实际转出；提取复用原转账，不记普通收入；没有关联账户时不推算提取。" };
    }
}
