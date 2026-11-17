using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static DateOnly AssetToday => DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date);
    private static void AssetCurrency(string currency) => Require(CurrencyDefinitions.Supports(currency), "币种无效");
    private static void AssetDate(DateOnly date) => Require(date.Year >= 1900 && date <= AssetToday, "日期须为1900年至今日");
    private async Task<ManagedAsset> Managed(string user, string id) => await db.Set<ManagedAsset>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "资产不存在");
    private static object ManagedView(ManagedAsset a, decimal? currentValue = null, DateOnly? valuationDate = null, string? valuationSource = null, decimal? actualInterest = null, decimal? liability = null, string? physicalState = null) => new { currentValue = currentValue == null ? null : M(currentValue.Value), valuationDate, valuationSource, actualInterest = actualInterest == null ? null : M(actualInterest.Value), liability = liability == null ? null : M(liability.Value), netValue = currentValue == null ? null : M(currentValue.Value - (liability ?? 0)), stale = valuationDate < AssetToday.AddDays(-90), a.Id, a.Name, a.Type, a.Currency, a.AccountId, a.LiabilityAccountId, a.FundingTransactionId, a.SettlementTransactionId, a.InterestTransactionId, cost = M(a.Cost), a.AcquiredDate, a.MaturityDate, annualRate = D(a.AnnualRate), a.DayCount, a.Institution, a.MaturityAction, state = physicalState ?? a.State, a.Note, version = a.Version.ToString(), expectedInterest = a.Type != "TermDeposit" || a.MaturityDate == null ? null : M(DepositInterest(a.Cost, a.AnnualRate, a.AcquiredDate, a.MaturityDate.Value, a.DayCount)), due = a.State == "Active" && a.MaturityDate <= AssetToday.AddDays(30), rule = a.Type == "TermDeposit" ? "登记对应存款账户及原转账，本金由账户权威计入；预计利息不增加余额，实际结算关联原流水。" : "手动估值；不改变资金账本。" };
    public static decimal DepositInterest(decimal principal, decimal rate, DateOnly start, DateOnly end, string dayCount)
    {
        Require(principal >= 0 && rate is >= 0 and <= 100 && end >= start && dayCount is "Actual365" or "Actual360", "计息参数无效");
        return decimal.Round(principal * rate / 100 * (end.DayNumber - start.DayNumber) / (dayCount == "Actual365" ? 365 : 360), 2, MidpointRounding.AwayFromZero);
    }
    public async Task<object> ManagedAssets(string user, bool deposits, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<ManagedAsset>().AsNoTracking().Where(x => x.UserId == user && (deposits ? x.Type == "TermDeposit" : x.Type != "TermDeposit"));
        var rows = await q.OrderBy(x => x.Name).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        var physicalSnapshot = deposits ? null : await LoadPhysicalSnapshot(user);
        var ids = rows.Select(x=>x.Id).ToArray(); var values = await db.Set<ManagedAssetValuation>().AsNoTracking().Where(x=>x.UserId==user && ids.Contains(x.AssetId)).ToArrayAsync();
        var incomeIds = rows.Where(x=>x.InterestTransactionId!=null).Select(x=>x.InterestTransactionId!).ToArray(); var incomes = await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && incomeIds.Contains(x.Id) && x.Status!="Deleted").ToDictionaryAsync(x=>x.Id,x=>x.Amount);
        var liabilityIds = rows.Where(x=>x.LiabilityAccountId!=null).Select(x=>x.LiabilityAccountId!).Distinct().ToArray();
        var liabilityAccounts = await db.Accounts.AsNoTracking().Where(x=>x.UserId==user && liabilityIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.OpeningBalance);
        var liabilityEntries = await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.UserId==user && e.Kind=="Account" && liabilityIds.Contains(e.AccountId!) && t.Status!="Deleted" group e by e.AccountId into g select new { Id=g.Key!, Value=g.Sum(x=>x.Amount) }).ToDictionaryAsync(x=>x.Id,x=>x.Value);
        return new { items = rows.Select(a=> { var v=values.Where(x=>x.AssetId==a.Id).OrderByDescending(x=>x.Date).ThenByDescending(x=>x.CreatedAt).ThenByDescending(x=>x.Id).FirstOrDefault(); decimal? actual=a.SettlementTransactionId != null ? a.InterestTransactionId==null?0:incomes.GetValueOrDefault(a.InterestTransactionId) : null; decimal? debt=a.LiabilityAccountId==null?null:Math.Max(0,-(liabilityAccounts.GetValueOrDefault(a.LiabilityAccountId)+liabilityEntries.GetValueOrDefault(a.LiabilityAccountId))); var physicalValue = physicalSnapshot?.Value(a, AssetToday); return ManagedView(a,physicalValue?.Value ?? (physicalValue == null ? v?.Amount : null),physicalValue?.ValuationDate ?? v?.Date,physicalValue?.Source ?? v?.Source,actual,debt,physicalValue?.State); }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> ManagedDetail(string user, string id) => ManagedView(await Managed(user, id));
    public async Task<object> SaveManagedAsset(string user, ManagedAssetInput b, bool deposits, string? id, string? version)
    {
        AssetCurrency(b.Currency); AssetDate(b.AcquiredDate);
        Require(b.Name.Trim().Length is > 0 and <= 150 && b.Note.Length <= 2000 && b.Institution.Length <= 150, "名称、机构或备注无效");
        Require(deposits ? b.Type == "TermDeposit" : b.Type is "Property" or "Vehicle" or "Valuable" or "Other", "资产类型无效");
        Require(b.State is "Active" or "Archived" && b.MaturityAction is "Manual" or "Renew", "状态或到期方式无效；续存仅提醒");
        var cost = Money(b.Cost); Require(cost >= 0, "取得成本不可为负"); var rate = InvestmentDecimal(b.AnnualRate); Require(rate <= 100, "年利率超出范围");
        if (deposits)
        {
            Require(cost > 0 && b.AccountId != null && (b.FundingTransactionId != null || b.BalanceAlreadyIncludesPrincipal) && b.MaturityDate > b.AcquiredDate && b.DayCount is "Actual365" or "Actual360", "存款须指定本金、专用账户、原本金转账、期限与计息规则");
            var account = await Account(user, b.AccountId!, id == null); Require(account.Currency == b.Currency && account.Type == "Bank", "请选择同币种专用银行存款账户");
            Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && x.Id != id && x.AccountId == account.Id && x.State == "Active"), "账户已有有效存款，禁止重复登记");
            if (b.FundingTransactionId == null) Require(id != null || await Balance(user, account.Id) >= cost, "已有存款账户余额不足以覆盖登记本金");
            else { var funding = await Transaction(user, b.FundingTransactionId!);
            Require(funding.Type == "Transfer" && funding.Status == "Confirmed" && funding.ToAccountId == account.Id && funding.Currency == b.Currency && funding.ReceivedAmount == cost && funding.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date == b.AcquiredDate.ToDateTime(TimeOnly.MinValue), "本金须关联同币种、同起息日期的有效转入流水");
            Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && x.Id != id && x.FundingTransactionId == funding.Id), "本金流水已被登记"); }
        }
        else
        {
            Require(b.FundingTransactionId==null,"实物资产不自动关联购置付款");
            if(b.AccountId!=null) { var assetAccount=await Account(user,b.AccountId,false);Require(assetAccount.Type=="Other" && assetAccount.Currency==b.Currency && b.BalanceAlreadyIncludesPrincipal && b.LiabilityAccountId!=b.AccountId && await Balance(user,assetAccount.Id)>=0,"已有资产账户须为同币种非负的其他账户，并确认余额只代表本项实物资产");Require(!await db.Set<ManagedAsset>().AnyAsync(x=>x.UserId==user && x.Id!=id && x.AccountId==b.AccountId && x.State=="Active"),"该资产账户已有权威归属"); }
        }
        if (b.LiabilityAccountId != null) { var liability = await Account(user, b.LiabilityAccountId, false); Require(liability.Currency == b.Currency && liability.Type is "Payable" or "Other" or "ConsumerLoan" or "SecuredLoan", "负债关联须为同币种已登记负债账户"); }
        var a = id == null ? new ManagedAsset { UserId = user } : await Managed(user, id);
        if (id != null && !deposits) Require(a.State == b.State, "实物资产状态请通过生命周期记录变更");
        if (id != null) { Version(a, version); Require(a.Type == b.Type && a.Currency == b.Currency && a.AccountId == b.AccountId && a.Cost == cost && a.AcquiredDate == b.AcquiredDate && a.FundingTransactionId == b.FundingTransactionId, "已有资产成本及资金归属不可改写"); Require(a.State is "Active" or "Archived" || b.State == "Archived" && a.AnnualRate == rate && a.MaturityDate == b.MaturityDate && a.DayCount == b.DayCount, "已结算存款只能保留合同信息归档"); a.Version++; }
        a.Name = b.Name.Trim(); a.Type = b.Type; a.Currency = b.Currency; a.AccountId = b.AccountId; a.LiabilityAccountId = b.LiabilityAccountId; a.Cost = cost; a.AcquiredDate = b.AcquiredDate; a.MaturityDate = b.MaturityDate; a.AnnualRate = rate; a.DayCount = b.DayCount; a.Institution = b.Institution; a.MaturityAction = b.MaturityAction; a.State = b.State; a.Note = b.Note; a.FundingTransactionId = b.FundingTransactionId;
        if (id == null) db.Add(a); return ManagedView(a);
    }
    public async Task<object> SaveManagedValuation(string user, string id, ManagedValuationInput b, string? version)
    {
        var a = await Managed(user, id); Version(a, version); Require(a.Type != "TermDeposit", "定期本金由资金账户核算，不另估值"); AssetDate(b.Date); Require(b.Date >= a.AcquiredDate && b.Source.Trim().Length is > 0 and <= 200, "估值日期或来源无效"); var amount = Money(b.Amount); Require(amount >= 0, "估值不可为负");
        var v = new ManagedAssetValuation { UserId = user, AssetId = a.Id, Date = b.Date, Amount = amount, Source = b.Source.Trim() }; db.Add(v); a.Version++; return new { v.Id, v.Date, amount = M(v.Amount), v.Source };
    }
    public async Task<object> ManagedValuations(string user, string id, IQueryCollection query)
    {
        await Managed(user, id); var (page, size) = Paging(query); var q = db.Set<ManagedAssetValuation>().AsNoTracking().Where(x => x.UserId == user && x.AssetId == id);
        var rows = await q.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Date, amount = M(x.Amount), x.Source, x.CreatedAt }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SettleDeposit(string user, string id, DepositSettlementInput b, string? version, bool preview)
    {
        var a = await Managed(user, id); Version(a, version); Require(a.Type == "TermDeposit" && a.State == "Active" && b.State is "Matured" or "EarlyWithdrawn" && b.Reason.Trim().Length is > 0 and <= 2000, "存款状态或结算说明无效");
        var principal = await Transaction(user, b.TransactionId); Require(principal.Type == "Transfer" && principal.Status == "Confirmed" && principal.AccountId == a.AccountId && principal.Currency == a.Currency && principal.Amount == a.Cost && principal.Fee == 0, "本金回收须关联专用存款账户的有效同币种无费用转账");
        var settled = DateOnly.FromDateTime(principal.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date); AssetDate(settled); Require(settled >= a.AcquiredDate && (b.State == "Matured" ? settled >= a.MaturityDate : settled < a.MaturityDate), "结算日期与到期状态不一致");
        Require(!await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && x.Id != id && (x.SettlementTransactionId == principal.Id || b.InterestTransactionId != null && x.InterestTransactionId == b.InterestTransactionId)), "结算流水已关联存款");
        var interest = Money(b.ActualInterest); Require(interest >= 0, "实际利息不可为负");
        if (interest > 0) { var income = await Transaction(user, b.InterestTransactionId ?? ""); Require(income.Type == "Income" && income.Status == "Confirmed" && income.Currency == a.Currency && income.Amount == interest && income.AccountId == principal.ToAccountId && income.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date == principal.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date, "实际利息须关联收款账户同日有效收入流水"); Require(!await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == income.Id && x.State == "Active"), "利息已经关联投资"); }
        else Require(b.InterestTransactionId == null, "零利息不能关联收入");
        decimal? earlyExpected = null; if(b.State == "EarlyWithdrawn") { var earlyRate = InvestmentDecimal(b.EarlyAnnualRate ?? ""); Require(earlyRate <= 100, "提前支取约定年利率无效"); earlyExpected = DepositInterest(a.Cost,earlyRate,a.AcquiredDate,settled,a.DayCount); }
        if (!preview) { a.SettlementTransactionId = principal.Id; a.InterestTransactionId = b.InterestTransactionId; a.State = b.State; a.Note += "\n结算：" + b.Reason; Require(a.Note.Length <= 2000, "结算说明导致备注过长"); a.Version++; }
        return new { a.Id, a.Currency, principal = M(a.Cost), earlyExpectedInterest = earlyExpected == null ? null : M(earlyExpected.Value), actualInterest = M(interest), settled, b.State, preview, rule = "只核对已存在的本金转账与利息收入，不再次过账；预计利息不作为实际利息。提前支取按银行实收确认。" };
    }
    public async Task<object> SaveFxValuation(string user, FxValuationInput b)
    {
        AssetCurrency(b.BaseCurrency); AssetCurrency(b.TargetCurrency); AssetDate(b.Date); Require(b.BaseCurrency != b.TargetCurrency && b.Source.Trim().Length is > 0 and <= 200, "汇率币种或来源无效"); var rate = InvestmentDecimal(b.Rate, true); Require(rate <= 1000000, "汇率超出范围"); var fx = new FxValuationRate { UserId = user, BaseCurrency = b.BaseCurrency, TargetCurrency = b.TargetCurrency, Rate = rate, Date = b.Date, Source = b.Source.Trim() }; db.Add(fx); return new { fx.Id, fx.BaseCurrency, fx.TargetCurrency, rate = D(fx.Rate), fx.Date, fx.Source };
    }
    public async Task<object> FxValuations(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<FxValuationRate>().AsNoTracking().Where(x => x.UserId == user); var rows = await q.OrderByDescending(x => x.Date).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync(); return new { items = rows.Select(x => new { x.Id, x.BaseCurrency, x.TargetCurrency, rate = D(x.Rate), x.Date, x.Source, x.CreatedAt }), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveAggregationPolicy(string user, AggregationPolicyInput b, string? version)
    {
        var account = await Account(user, b.AccountId, false); Require(account.Type == "Investment" && b.Mode is "Unknown" or "CashOnly" or "TotalAssets" && b.Reason.Trim().Length is > 0 and <= 2000, "仅投资账户须确认现金/总资产语义，并填写依据");
        var p = await db.Set<AssetAggregationPolicy>().SingleOrDefaultAsync(x => x.UserId == user && x.AccountId == b.AccountId); if (p == null) { p = new AssetAggregationPolicy { UserId = user, AccountId = b.AccountId }; db.Add(p); } else { Version(p, version); p.Version++; } p.Mode = b.Mode; p.Reason = b.Reason; return new { p.Id, p.AccountId, p.Mode, version = p.Version.ToString() };
    }
}






