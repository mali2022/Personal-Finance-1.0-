using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private static decimal PrepaymentRemaining(PrepaymentContract p) => p.Amount - p.ConsumedAmount - p.RefundedAmount - p.WrittenOffAmount;
    private static object PrepaymentView(PrepaymentContract p) => new { p.Id, p.Name, p.Counterparty, p.ContractReference, p.Type, p.Currency, p.FundingTransactionId, p.AccountId, p.AssetAccountId, p.AccountingMode,
        amount = M(p.Amount), consumedAmount = M(p.ConsumedAmount), refundedAmount = M(p.RefundedAmount), writtenOffAmount = M(p.WrittenOffAmount), remaining = M(PrepaymentRemaining(p)),
        p.ExpiresOn, p.State, p.Note, version = p.Version.ToString(), rule = p.AccountingMode == "AssetAccount" ? "资产仅由专用原账户余额计量，不另加合同余额" : "历史费用仅跟踪，不重分类、不重复计资产或费用" };
    public async Task<object> Prepayments(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<PrepaymentContract>().AsNoTracking().Where(x => x.UserId == user);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(PrepaymentView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> CreatePrepayment(string user, PrepaymentInput b)
    {
        Require(b.Counterparty is not null && b.Counterparty.Length <= 200 && b.ContractReference is not null && b.ContractReference.Length <= 200, "收款方或合同编号无效");
        Require(b.Name.Trim().Length is > 0 and <= 200 && b.Note.Length <= 2000 && b.Type is "RefundableDeposit" or "ServiceAdvance" or "GoodsAdvance" or "StoredPrincipal" or "Guarantee" or "Unconfirmed", "预付款名称或类型无效");
        Require(b.AccountingMode is "TrackingOnly" or "AssetAccount", "预付款核算口径无效");
        var t = await Transaction(user, b.FundingTransactionId); Require(t.Status == "Confirmed" && t.BusinessId == null, "资金流水须为已确认普通支付");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.FundingTransactionId == t.Id), "支付流水已关联预付款");
        Require(!await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id) && !await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && x.FundingTransactionId == t.Id), "付款已关联其他资产业务");
        Require(!await db.Set<CashbackReceivable>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id && x.State != "Revoked"), "原付款有关联返现，请先核对返现性质和已有退款后再登记预付款");
        string? assetAccount = null;
        if (b.AccountingMode == "AssetAccount")
        {
            Require(t.Type == "Transfer" && t.ToAccountId != null && t.Fee == 0, "预付资产需关联同币种无手续费的实际本金转账"); var a = await Account(user, t.ToAccountId!);
            Require(a.Currency == t.Currency && a.Type is "Other" or "StoredValue" && a.OpeningBalance == 0 && await Balance(user, a.Id) == t.Amount, "请选择余额仅包含本合同本金的同币种专用资产账户");
            Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.AssetAccountId == a.Id) && !await db.Set<ManagedAsset>().AnyAsync(x => x.UserId == user && x.AccountId == a.Id), "该资产账户已有权威业务归属"); assetAccount = a.Id;
            Require(!await (from e in db.Entries join existing in db.Transactions on e.TransactionId equals existing.Id where e.UserId == user && e.AccountId == a.Id && existing.Id != t.Id && existing.Status != "Deleted" select e.Id).AnyAsync(), "专用资产账户存在其他有效资金流水，不能默认归属本合同");
        }
        else Require(t.Type == "Expense", "历史跟踪仅关联已登记的实际支出；不自动形成资产");
        Require(b.ExpiresOn == null || b.ExpiresOn.Value.Year is >= 1900 and <= 9998, "到期日期无效");
        var p = new PrepaymentContract { UserId = user, Name = b.Name.Trim(), Type = b.Type, Currency = t.Currency, FundingTransactionId = t.Id, AccountId = t.AccountId!, AssetAccountId = assetAccount,
            AccountingMode = b.AccountingMode, Amount = t.Amount, ExpiresOn = b.ExpiresOn, Note = b.Note, Counterparty = b.Counterparty!.Trim().Length > 0 ? b.Counterparty.Trim() : t.Merchant ?? "", ContractReference = b.ContractReference!.Trim() };
        if (b.AccountingMode == "TrackingOnly")
        {
            var refunds = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.OriginalTransactionId == t.Id && x.Type == "Refund" && x.Status != "Deleted").ToArrayAsync();
            p.RefundedAmount = refunds.Sum(x => x.Amount); Require(p.RefundedAmount <= p.Amount, "历史退款超过付款金额，请先核对原账本");
            foreach (var refund in refunds) db.Add(new PrepaymentSettlement { UserId = user, ContractId = p.Id, Action = "Refund", Amount = refund.Amount, TransactionId = refund.Id, Reason = "关联档案时带入既有真实退款，不再次入账" });
            if (PrepaymentRemaining(p) == 0) p.State = "Closed";
        }
        db.Add(p); return PrepaymentView(p);
    }
    public async Task<object> SettlePrepayment(string user, string id, PrepaymentAction b, string? version, bool preview)
    {
        var p = await db.Set<PrepaymentContract>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "预付款不存在"); Version(p, version);
        var amount = Money(b.Amount, true); Require(p.State == "Active" && amount <= PrepaymentRemaining(p) && b.Action is "Consume" or "Refund" or "WriteOff" && b.Reason.Trim().Length is > 0 and <= 2000, "结算金额、状态或原因无效");
        var funding = await Transaction(user, p.FundingTransactionId); Require(funding.Status == "Confirmed", "原支付状态已改变");
        string? transactionId = null; var cashImpact = 0m; var liabilityImpact = 0m;
        if (p.AccountingMode == "AssetAccount")
        {
            Require(b.Transaction != null, "预付资产消费、退回或核销必须使用真实交易"); var t = b.Transaction!;
            Require(t.AccountId == p.AssetAccountId && Money(t.Amount) == amount && Money(t.Fee) == 0 && t.OccurredAt >= funding.OccurredAt, "资产核销账户、金额或日期无效");
            Require(b.Action == "Consume" ? t.Type == "Expense" : b.Action == "Refund" ? t.Type == "Transfer" : t.Type == "AssetLoss", "结算交易类型无效");
            Require(amount <= await Balance(user, p.AssetAccountId!), "专用资产账户余额不足，请先核对流水");
            if (b.Action == "Refund") { var target = await Account(user, t.ToAccountId ?? ""); Require(target.Currency == p.Currency && !(target.Type == "Receivable" || target.Type == "Payable" || target.Type == "ConsumerLoan" || target.Type == "SecuredLoan"), "退款需到账同币种实际资金账户"); cashImpact = (target.Type == "CreditCard" || target.Type == "ConsumerCredit") ? 0 : amount; liabilityImpact = (target.Type == "CreditCard" || target.Type == "ConsumerCredit") ? -amount : 0; }
            if (!preview) { var result = await SaveTransaction(user, t, stageGOperation: true); transactionId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); }
        }
        else if (b.Action == "Refund")
        {
            Require(b.Transaction != null && b.Transaction.Type == "Refund" && b.Transaction.OriginalTransactionId == p.FundingTransactionId && Money(b.Transaction.Amount) == amount, "历史费用退回必须关联原支出的实际退款");
            var target = await Account(user, b.Transaction!.AccountId); cashImpact = (target.Type == "CreditCard" || target.Type == "ConsumerCredit") ? 0 : amount; liabilityImpact = (target.Type == "CreditCard" || target.Type == "ConsumerCredit") ? -amount : 0;
            if (!preview) { var result = await SaveTransaction(user, b.Transaction!, stageGOperation: true); transactionId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); }
        }
        else Require(b.Transaction == null, "历史费用使用或失效仅跟踪，不再次确认费用或现金");
        if (preview) return new { p.Id, p.AccountingMode, b.Action, amount = M(amount), remaining = M(PrepaymentRemaining(p) - amount), cashImpact = M(cashImpact), liabilityImpact = M(liabilityImpact), expenseImpact = M(b.Action == "Consume" && p.AccountingMode == "AssetAccount" ? amount : 0), preview };
        if (b.Action == "Consume") p.ConsumedAmount += amount; else if (b.Action == "Refund") p.RefundedAmount += amount; else p.WrittenOffAmount += amount;
        if (PrepaymentRemaining(p) == 0) p.State = "Closed"; p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new PrepaymentSettlement { UserId = user, ContractId = p.Id, Action = b.Action, Amount = amount, TransactionId = transactionId, Reason = b.Reason.Trim() }); return PrepaymentView(p);
    }
    public async Task<object> PrepaymentHistory(string user, string id)
    {
        var p = await db.Set<PrepaymentContract>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "预付款不存在");
        var rows = await db.Set<PrepaymentSettlement>().AsNoTracking().Where(x => x.UserId == user && x.ContractId == id).OrderBy(x => x.CreatedAt).ToArrayAsync();
        return new { contract = PrepaymentView(p), history = rows.Select(x => new { x.Id, x.Action, amount = M(x.Amount), x.TransactionId, x.ReversalOfId, x.Reason, x.CreatedAt }) };
    }
}


