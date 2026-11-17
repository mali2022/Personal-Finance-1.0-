using System.Globalization;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private async Task ProtectStageGTransaction(string user, string id)
    {
        Require(!await db.Set<FundHoldEvent>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "冻结结算流水受保护，请先核对资金状态历史");
        Require(!await db.Set<PayrollPayment>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "工资到账流水受保护，请先解除工资关联");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.FundingTransactionId == id) && !await db.Set<PrepaymentSettlement>().AnyAsync(x => x.UserId == user && x.TransactionId == id), "预付款关联流水受保护，请先核对合同历史");
        Require(!await db.Set<ThirdPartyAdvance>().AnyAsync(x => x.UserId == user && x.OwnTransactionId == id), "代付本人费用受保护，请从代付记录核对或登记关联退款");
    }
    private async Task ValidateAuthorizedRestore(string user, string id)
    {
        var link = await db.Set<AuthorizedPayment>().SingleOrDefaultAsync(x => x.UserId == user && x.TransactionId == id); if (link == null) return;
        var p = await db.Set<PaymentInstrument>().SingleAsync(x => x.UserId == user && x.Id == link.InstrumentId);
        var t = await Transaction(user, id); var local = t.OccurredAt.ToOffset(TimeSpan.FromHours(8));
        var first = new DateTimeOffset(local.Year, local.Month, 1, 0, 0, 0, TimeSpan.FromHours(8)); var end = first.AddMonths(1);
        var used = await (from a in db.Set<AuthorizedPayment>() join tx in db.Transactions on a.TransactionId equals tx.Id
            where a.UserId == user && a.InstrumentId == p.Id && tx.Status != "Deleted" && tx.OccurredAt >= first && tx.OccurredAt < end select a.ChargedAmount ?? tx.Amount).SumAsync(x => (decimal?)x) ?? 0;
        Require(p.MonthlyLimit == null || used + (link.ChargedAmount ?? t.Amount) <= p.MonthlyLimit, "恢复授权付款将超过本月限额");
    }
    private static readonly CurrencyDefinitions.Currency[] SupportedCurrencies = CurrencyDefinitions.Items;

    public async Task<object> CurrencyCatalog(string user)
    {
        var preferences = await db.Set<CurrencyPreference>().AsNoTracking().Where(x => x.UserId == user).ToArrayAsync();
        var accountCodes = await db.Accounts.Where(x => x.UserId == user).Select(x => x.Currency).Distinct().ToArrayAsync();
        var transactionCodes = await db.Transactions.Where(x => x.UserId == user).Select(x => x.Currency).Distinct().ToArrayAsync();
        return SupportedCurrencies.Select((x, index) => {
            var p = preferences.SingleOrDefault(p => p.Currency == x.Code);
            return new { code = x.Code, name = p?.Name ?? x.Name, x.InternationalName, x.Symbol, decimalPlaces = 2,
                enabled = p?.Enabled ?? true, sortOrder = p?.SortOrder ?? index, historicalUse = accountCodes.Contains(x.Code) || transactionCodes.Contains(x.Code),
                version = p?.Version.ToString(CultureInfo.InvariantCulture) ?? "0" };
        }).OrderBy(x => x.sortOrder).ThenBy(x => x.code).ToArray();
    }
    public async Task<object> SaveCurrencyPreference(string user, string code, CurrencyPreferenceInput input, string? version)
    {
        AssetCurrency(code); Require(input.Enabled || !await db.Users.AnyAsync(x=>x.Id==user && x.PreferredCurrency==code), "默认货币不能停用，请先更改默认货币"); Require(input.Name.Trim().Length is > 0 and <= 100 && input.SortOrder is >= 0 and <= 1000, "货币名称或顺序无效");
        var p = await db.Set<CurrencyPreference>().SingleOrDefaultAsync(x => x.UserId == user && x.Currency == code);
        if (p == null) { Require(version == "0", "货币设置版本已改变，请刷新"); p = new() { UserId = user, Currency = code }; db.Add(p); }
        else { Version(p, version); p.Version++; }
        p.Name = input.Name.Trim(); p.Enabled = input.Enabled; p.SortOrder = input.SortOrder; p.UpdatedAt = DateTimeOffset.UtcNow;
        return new { code, version = p.Version.ToString(), rule = "停用仅限制新账户；历史账户、交易及估值保留。精度不可改写。" };
    }
    private async Task RequireEnabledCurrency(string user, string currency)
    {
        Require(!await db.Set<CurrencyPreference>().AnyAsync(x => x.UserId == user && x.Currency == currency && !x.Enabled), "该币种已停用，请先启用后再创建账户");
    }
    public async Task<object> FxPreview(string user, IQueryCollection query)
    {
        var source = query["baseCurrency"].ToString(); var target = query["targetCurrency"].ToString();
        AssetCurrency(source); AssetCurrency(target);
        Require(DateOnly.TryParseExact(query["date"], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date), "日期格式无效"); AssetDate(date);
        var amount = Money(query["amount"]); var strategy = query["strategy"].ToString(); if (strategy == "") strategy = "LatestOnOrBefore";
        var rates = await db.Set<FxValuationRate>().AsNoTracking().Where(x => x.UserId == user && x.BaseCurrency == source && x.TargetCurrency == target && x.Date <= date).ToArrayAsync();
        var selected = FxRateSelection.Select(rates, source, target, date, strategy);
        var rate = source == target ? 1m : selected?.Rate;
        return new { baseCurrency = source, targetCurrency = target, date, strategy, originalAmount = M(amount),
            amount = rate == null ? null : M(decimal.Round(amount * rate.Value, 2, MidpointRounding.AwayFromZero)),
            rate = rate == null ? null : D(rate.Value), rateId = source == target ? null : selected?.Id, rateDate = source == target ? date : selected?.Date,
            rateSource = source == target ? "同币种" : selected?.Source, ageDays = selected == null || source == target ? (int?)null : date.DayNumber - selected.Date.DayNumber,
            missing = rate == null ? "缺少符合日期策略的直接汇率" : null, quote = "1 " + source + " = 汇率 × " + target,
            purpose = "HistoricalValuation", cashImpact = "0.00" };
    }
    private static object InstrumentView(PaymentInstrument x) => new { x.Id, x.Name, x.Type, x.AccountId, x.Authorizer, x.Consumer, x.Currency,
        monthlyLimit = x.MonthlyLimit == null ? null : M(x.MonthlyLimit.Value), x.StartsOn, x.EndsOn, x.State, x.Note, version = x.Version.ToString() };
    public async Task<object> PaymentInstruments(string user)
    {
        var rows = await db.Set<PaymentInstrument>().AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.CreatedAt).ToArrayAsync();
        return rows.Select(InstrumentView).ToArray();
    }
    public async Task<object> SavePaymentInstrument(string user, PaymentInstrumentInput b, string? id, string? version)
    {
        Require(b.Name.Trim().Length is > 0 and <= 150 && b.Authorizer.Trim().Length is > 0 and <= 150 && b.Consumer.Trim().Length is > 0 and <= 150 && b.Note.Length <= 2000, "授权名称或角色无效");
        Require(b.Type is "WeChatFamilyCard" or "AlipayFamilyCard" or "SupplementaryCard" or "ThirdPartyAuthorization" or "Other" && b.State is "Active" or "Paused" or "Revoked", "授权类型或状态无效");
        Require(b.StartsOn.Year >= 1900 && (b.EndsOn == null || b.EndsOn >= b.StartsOn), "授权有效期无效");
        var a = await Account(user, b.AccountId); Require(!(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan"), "授权只能关联实际资金账户");
        decimal? limit = b.MonthlyLimit == null ? null : Money(b.MonthlyLimit, true);
        var p = id == null ? new PaymentInstrument { UserId = user, AccountId = a.Id, Currency = a.Currency } :
            await db.Set<PaymentInstrument>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "付款工具不存在");
        if (id != null) { Version(p, version); Require(p.AccountId == a.Id && p.Type == b.Type, "已有授权的实际账户与类型不可改写，请新建工具"); Require(p.State != "Revoked" || b.State == "Revoked", "已撤销授权不可重新启用"); p.Version++; }
        p.Name = b.Name.Trim(); p.Type = b.Type; p.Authorizer = b.Authorizer.Trim(); p.Consumer = b.Consumer.Trim(); p.StartsOn = b.StartsOn; p.EndsOn = b.EndsOn;
        p.MonthlyLimit = limit; p.State = b.State; p.Note = b.Note; p.UpdatedAt = DateTimeOffset.UtcNow; if (id == null) db.Add(p);
        return InstrumentView(p);
    }
    public async Task<object> CreateAuthorizedPayment(string user, AuthorizedPaymentInput b, bool preview)
    {
        var p = await db.Set<PaymentInstrument>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == b.InstrumentId) ?? throw new ApiException(404, "付款工具不存在");
        Version(p, b.InstrumentVersion); var date = DateOnly.FromDateTime(b.Transaction.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date);
        Require(p.State == "Active" && date >= p.StartsOn && (p.EndsOn == null || date <= p.EndsOn), "授权未生效、已暂停或已到期");
        Require(b.Transaction.Type == "Expense" && b.Transaction.AccountId == p.AccountId, "授权付款必须是实际扣款账户的支出");
        var account = await Account(user, p.AccountId); Require(account.Currency == p.Currency, "授权币种不一致"); var amount = Money(b.Transaction.Amount, true);
        var first = new DateTimeOffset(date.Year, date.Month, 1, 0, 0, 0, TimeSpan.FromHours(8)); var end = first.AddMonths(1);
        var spent = await (from link in db.Set<AuthorizedPayment>() join t in db.Transactions on link.TransactionId equals t.Id
            where link.UserId == user && link.InstrumentId == p.Id && t.Status != "Deleted" && t.OccurredAt >= first && t.OccurredAt < end select link.ChargedAmount ?? t.Amount).SumAsync(x => (decimal?)x) ?? 0;
        Require(p.MonthlyLimit == null || spent + amount <= p.MonthlyLimit, "付款金额超过本月授权限额");
        if (preview) return new { accountId = p.AccountId, p.Consumer, p.Authorizer, p.Currency, cashImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? 0 : -amount), accountImpact = M(-amount), liabilityImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? amount : 0), monthUsed = M(spent), afterUsed = M(spent + amount), createsReceivable = false };
        var result = await SaveTransaction(user, b.Transaction);
        var transactionId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString()!;
        db.Add(new AuthorizedPayment { UserId = user, ChargedAmount = amount, InstrumentId = p.Id, TransactionId = transactionId, AccountId = p.AccountId, Consumer = p.Consumer, Authorizer = p.Authorizer });
        p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        return new { transactionId, instrumentId = p.Id, accountId = p.AccountId, version = p.Version.ToString() };
    }
}



