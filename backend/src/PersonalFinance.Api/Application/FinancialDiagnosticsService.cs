using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using System.Text.Json;
using System.Globalization;
using Microsoft.Extensions.Primitives;

namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    // Always re-evaluate: a tool session may have read diagnostics before a write.
    public async Task<object> FinancialDiagnostics(string user, CancellationToken ct = default, string currency = "CNY")
    {
        Require(CurrencyDefinitions.Supports(currency), "币种无效");
        workspaceAnomalyMatches.Clear();
        var findings = new List<object>();
        foreach (var rule in AnomalyRules)
        {
            var ids = await WorkspaceAnomalyIds(user, rule, ct);
            findings.Add(new { rule, count = ids.Length, transactionIds = ids.Take(100), truncated = ids.Length > 100,
                cause = rule switch { "Balance" => "资金分录缺失或本位金额不平衡", "Duplicate" => "相同账户、时间、类型、金额及商户的疑似重复", "Transfer" => "转账账户或收付分录缺失", "Refund" => "退款缺少同币种且时间有效的原支出", "Category" => "收支分类分录或分类记录缺失", _ => "命中交易工作台确定性规则" },
                impact = "账户余额、预算、现金流及财务分析可能受影响；疑似异常不等于错误",
                suggestion = "核对原始凭证与关联交易，通过现有编辑或冲正流程修复后重新诊断；不自动改写历史",
                review = ids.Length == 0 ? "Passed" : "NeedsReview" });
        }
        var debt = await db.Accounts.AsNoTracking().Where(a => a.UserId == user && (a.Type == "CreditCard" || a.Type == "ConsumerCredit" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan")).ToArrayAsync(ct);
        var debtChecks = new List<object>();
        var debtLedger = await CurrentAccountBalances(user, debt.Select(x => x.Id).ToArray());
        foreach (var account in debt)
        {
            var balance = account.OpeningBalance + (debtLedger.GetValueOrDefault(account.Id)?.Amount ?? 0);
            if (balance > 0) debtChecks.Add(new { accountId = account.Id, account.Currency, balance = M(balance), cause = "负债账户呈正余额，可能为溢缴款", suggestion = "核对账单及溢缴款，不自动调整", review = "NeedsReview" });
        }
        var investmentChecks = new List<object>();
        var activeTrades = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && x.State == "Active").Take(100001).ToArrayAsync(ct);
        Require(activeTrades.Length <= 100000, "投资诊断超过十万条，请先分账核对");
        foreach (var duplicate in activeTrades.Where(x => x.TransactionId != null).GroupBy(x => x.TransactionId).Where(g => g.Count() > 1))
            investmentChecks.Add(new { transactionId = duplicate.Key, cause = "同一资金流水被多笔有效投资交易引用", suggestion = "核对重复关联，按投资更正流程复核", review = "NeedsReview" });
        var linkedCash = await (from t in db.Transactions
            join e in db.Entries on t.Id equals e.TransactionId
            where t.UserId == user && e.UserId == user && t.Status != "Deleted" && e.Kind == "Account"
                && db.Set<InvestmentTrade>().Any(x => x.UserId == user && x.State == "Active" && x.TransactionId == t.Id)
            group e by t.Id into g select new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount, ct);
        foreach (var group in activeTrades.GroupBy(x => x.AssetId))
        {
            ct.ThrowIfCancellationRequested();
            var id = group.Key;
            var trades = group.ToArray();
            try { InvestmentMath.ValidateHistory(trades); }
            catch (ApiException e) { investmentChecks.Add(new { assetId = id, cause = e.Message, suggestion = "复核交易日与结算日的持仓历史", review = "NeedsReview" }); }
            foreach (var trade in trades.Where(x => x.Type is "Buy" or "Sell" or "Dividend" or "Interest" or "Fee"))
            {
                if (trade.TransactionId == null || !linkedCash.TryGetValue(trade.TransactionId, out var amount) || amount != InvestmentMath.CashMovement(trade))
                    investmentChecks.Add(new { assetId = id, tradeId = trade.Id, cause = "投资流水关联缺失、删除或现金净额不符", suggestion = "复核资金流水与投资交易，不重复登记本金", review = "NeedsReview" });
            }
        }
        var reconciliationChecks = await db.Set<StatementBalanceSnapshot>().AsNoTracking()
            .Where(x => x.UserId == user && x.AdjustedDifference != 0)
            .OrderByDescending(x => x.CreatedAt).Take(101)
            .Select(x => new { x.Id, x.AccountId, x.Currency, x.EndsAt, x.AdjustedDifference,
                cause = "历史对账快照存在调整后差额", suggestion = "核对银行单边、账本单边及后续修复记录，再创建新的复核快照", review = "HistoricalDifference" }).ToArrayAsync(ct);
        var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = new DateOnly(today.Year, today.Month, 1).ToString("yyyy-MM-dd"), ["end"] = today.ToString("yyyy-MM-dd"), ["currency"] = currency, ["granularity"] = "day" });
        var report = JsonSerializer.SerializeToElement(await Report(user, query), Json);
        decimal Number(JsonElement value, string key) => decimal.Parse(value.GetProperty(key).GetString()!, CultureInfo.InvariantCulture);
        var points = report.GetProperty("points").EnumerateArray().ToArray();
        var reportChecks = new[] { "income", "expense" }.Select(key => new { metric = key, total = Number(report, key), pointsTotal = points.Sum(p => Number(p, key)), review = Number(report, key) == points.Sum(p => Number(p, key)) ? "Passed" : "NeedsReview" }).ToArray();
        object analysisBasis;
        try
        {
            var allocation = JsonSerializer.SerializeToElement(await AssetAllocation(user, new QueryCollection(new Dictionary<string, StringValues> { ["currency"] = currency, ["date"] = today.ToString("yyyy-MM-dd") })), Json);
            analysisBasis = new { valuationComplete = allocation.GetProperty("complete").GetBoolean(), missingValuationCount = allocation.GetProperty("uncovered").GetInt32(), explanation = "综合估值缺口必须随AI依据公开；账本净资产和综合估值净资产不可混用。此检查不证明模型回答语义正确。" };
        }
        catch (ApiException e)
        {
            analysisBasis = new { valuationComplete = false, missingValuationCount = (int?)null, explanation = "估值计算失败，不能作为AI分析依据：" + e.Message };
        }
        return new { evaluatedAt = DateTimeOffset.UtcNow, currency, source = "有效交易及账户分录；确定性规则，无AI推断", findings, debtChecks, investmentChecks, reportChecks,
            analysisBasis,
            reconciliationChecks = reconciliationChecks.Take(100), reconciliationTruncated = reconciliationChecks.Length > 100,
            scope = "交易完整性与负债符号检查；未覆盖外部账单真实性、持仓外部确认和AI回答证据完整性。通过仅表示当前规则未检出异常。" };
    }
}
