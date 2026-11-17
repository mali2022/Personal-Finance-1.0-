using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private async Task<ThirdPartyAdvance> AdvanceEntity(string user, string id) => await db.Set<ThirdPartyAdvance>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "代付不存在");
    public async Task<object> AdvanceDetail(string user, string id)
    {
        var a = await AdvanceEntity(user, id); decimal settled = 0; string? businessVersion = null;
        if (a.BusinessId != null) { var b = await BusinessEntity(user, a.BusinessId); settled = await Settled(user, b); businessVersion = b.Version.ToString(); }
        var adjustments = await db.Set<AdvanceAdjustment>().AsNoTracking().Where(x => x.UserId == user && x.AdvanceId == id).ToArrayAsync();
        var nonCash = adjustments.Where(x => x.Action is "Gift" or "WriteOff").Sum(x => x.Amount);
        var paymentAuthorization = await (from link in db.Set<AuthorizedPayment>() join tx in db.Transactions on link.TransactionId equals tx.Id where link.UserId == user && (a.OwnTransactionId != null && link.TransactionId == a.OwnTransactionId || a.BusinessId != null && tx.BusinessId == a.BusinessId) select new { link.InstrumentId, link.Authorizer, link.Consumer, chargedAmount = M(link.ChargedAmount ?? tx.Amount) }).FirstOrDefaultAsync();
        var ownRefunds = a.OwnTransactionId == null ? 0 : await db.Transactions.Where(x => x.UserId == user && x.OriginalTransactionId == a.OwnTransactionId && x.Status != "Deleted" && x.Type == "Refund").SumAsync(x => (decimal?)x.Amount) ?? 0;
        var history = await db.AuditRecords.AsNoTracking().Where(x => x.UserId == user && x.ResourceType == nameof(ThirdPartyAdvance) && x.ResourceId == a.Id).OrderByDescending(x => x.CreatedAt).Take(100).ToArrayAsync();
        var settlements = a.BusinessId == null ? [] : await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.BusinessId == a.BusinessId && x.Type == "ReimbursementReceived").OrderBy(x => x.OccurredAt).Take(100).ToArrayAsync();
        var fundingTransactions = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && (x.Id == a.OwnTransactionId || a.BusinessId != null && x.BusinessId == a.BusinessId && x.Type == "ReimbursementAdvance")).ToArrayAsync();
        return new { a.Id, a.Name, a.Counterparty, a.AccountId, a.Currency, amount = M(a.Amount), ownAmount = M(a.OwnAmount), ownRefunds = M(ownRefunds), receivable = M(a.Amount - a.OwnAmount), settled = M(settled - nonCash), gifted = M(adjustments.Where(x => x.Action == "Gift").Sum(x => x.Amount)), writtenOff = M(adjustments.Where(x => x.Action == "WriteOff").Sum(x => x.Amount)), remaining = M(a.Amount - a.OwnAmount - settled),
            paymentAuthorization, history = history.Select(x => new { x.Id, x.Action, x.CreatedAt, changes = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(x.ChangesJson) }), historyLimit = 100,
            fundingTransactions = fundingTransactions.Select(x => new { transactionId = x.Id, x.Type, x.Status, amount = M(x.Amount) }),
            settlements = settlements.Select(x => new { transactionId = x.Id, x.Type, x.Status, amount = M(x.Amount), x.OccurredAt }), settlementHistoryLimit = 100,
            adjustments = adjustments.Select(x => new { x.Id, x.Action, amount = M(x.Amount), x.TransactionId, x.Reason, x.CreatedAt }),
            a.Payer, a.Platform, a.Merchant, a.Consumer, a.Beneficiary, a.GroupId, a.BusinessId, businessVersion, a.OwnTransactionId, a.OccurredAt, quantity = D(a.Quantity), a.Unit, a.DeliveryState, a.DeliveredOn, a.Recipient, a.Note, version = a.Version.ToString(),
            rule = "实际付款拆为本人费用与专项代垫本金，两者合计只扣一次总额；本金复用原业务结算，应收仅由专项账户计量；实物交付不产生资金。" };
    }
    public async Task<object> Advances(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<ThirdPartyAdvance>().Where(x => x.UserId == user); var ids = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArrayAsync();
        var items = new List<object>(); foreach (var id in ids) items.Add(await AdvanceDetail(user, id)); return new { items, total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> CreateAdvance(string user, AdvanceInput b, bool preview)
    {
        Require(new[] { b.Payer, b.Platform, b.Merchant, b.Consumer, b.Beneficiary }.All(x => x is not null && x.Length <= 200), "付款或使用角色信息无效");
        Require(b.Name.Trim().Length is > 0 and <= 200 && b.Counterparty.Trim().Length is > 0 and <= 200 && b.Note.Length <= 2000 && b.Unit.Trim().Length is > 0 and <= 30 && b.Recipient.Length <= 200, "代付档案信息无效");
        var account = await Account(user, b.AccountId); Require(!(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "请选择实际资金账户");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.AssetAccountId == account.Id), "不能用预付款专用账户代付");
        var total = Money(b.Amount, true); var own = Money(b.OwnAmount); Require(own >= 0 && own <= total, "自己承担金额超出实付款"); var quantity = InvestmentDecimal(b.Quantity, true);
        if (own > 0) await Category(user, b.CategoryId ?? "", "Expense");
        var instrument = b.InstrumentId == null ? null : await ValidateAdvanceAuthorization(user, b.InstrumentId, b.InstrumentVersion, account.Id, total, b.OccurredAt);
        if (preview) return new { accountId = account.Id, account.Currency, cashImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? 0 : -total), accountImpact = M(-total), liabilityImpact = M((account.Type == "CreditCard" || account.Type == "ConsumerCredit") ? total : 0), expense = M(own), receivable = M(total - own), instrumentId = instrument?.Id, authorizer = instrument?.Authorizer, consumer = instrument?.Consumer, rule = "授权只解释付款渠道；月限额按实际总付款核对，应收仍由明确承担额决定。", preview };
        var a = new ThirdPartyAdvance { UserId = user, Name = b.Name.Trim(), Counterparty = b.Counterparty.Trim(), AccountId = account.Id, Currency = account.Currency,
            Amount = total, OwnAmount = own, OccurredAt = b.OccurredAt, Quantity = quantity, Unit = b.Unit.Trim(), Recipient = b.Recipient, Note = b.Note, Payer = b.Payer.Trim(), Platform = b.Platform.Trim(), Merchant = b.Merchant.Trim(), Consumer = b.Consumer.Trim().Length > 0 ? b.Consumer.Trim() : instrument?.Consumer ?? "", Beneficiary = b.Beneficiary.Trim() };
        if (own > 0) { var result = await SaveTransaction(user, new SaveTransaction("Expense", M(own), account.Id, b.OccurredAt, b.Note, b.CategoryId, b.Name)); a.OwnTransactionId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); }
        if (total > own) { var result = await CreateBusiness(user, new BusinessInput("Advance", b.Counterparty, account.Id, M(total - own), b.OccurredAt, b.Note), stageGOperation: true); a.BusinessId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); }
        if (instrument != null)
        {
            var linkedTransaction = a.OwnTransactionId ?? db.Transactions.Local.Single(x => x.UserId == user && x.BusinessId == a.BusinessId).Id;
            db.Add(new AuthorizedPayment { UserId = user, InstrumentId = instrument.Id, TransactionId = linkedTransaction, AccountId = account.Id, Consumer = instrument.Consumer, Authorizer = instrument.Authorizer, ChargedAmount = total });
            instrument.Version++; instrument.UpdatedAt = DateTimeOffset.UtcNow;
        }
        db.Add(a); return new { a.Id, a.BusinessId, a.OwnTransactionId, version = a.Version.ToString(), instrumentVersion = instrument?.Version.ToString() };
    }
    public async Task<object> SettleAdvance(string user, string id, SettlementInput b, string? version, bool preview)
    {
        var a = await AdvanceEntity(user, id); Version(a, version); Require(a.BusinessId != null, "纯赠与没有应收本金"); var business = await BusinessEntity(user, a.BusinessId!);
        var amount = Money(b.Amount, true); Require(amount <= business.Principal - await Settled(user, business), "收回金额超过剩余应收");
        var account = await Account(user, b.AccountId); Require(account.Currency == a.Currency && !((account.Type == "CreditCard" || account.Type == "ConsumerCredit") || (account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan")), "收款账户无效");
        Require(b.OccurredAt >= a.OccurredAt, "收回日期不能早于代付");
        if (preview) return new { a.Id, amount = M(amount), cashImpact = M(amount), ordinaryIncome = "0.00", preview };
        await SettleBusiness(user, business.Id, b, business.Version.ToString(), stageGOperation: true); a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow; return new { a.Id, version = a.Version.ToString() };
    }
    public async Task<object> DeliverAdvance(string user, string id, AdvanceDeliveryInput b, string? version)
    {
        var a = await AdvanceEntity(user, id); Version(a, version); Require(b.Recipient.Length <= 200 &&
            (a.DeliveryState == "Purchased" && b.State is "PendingDelivery" or "Delivered" or "Returned" || a.DeliveryState == "PendingDelivery" && b.State is "Delivered" or "Returned" || a.DeliveryState == "Delivered" && b.State == "Returned"), "交付状态转换无效");
        Require(b.State != "Delivered" || b.DeliveredOn != null && b.Recipient.Trim().Length > 0, "交付需填写接收人与日期");
        if (b.DeliveredOn != null) { AssetDate(b.DeliveredOn.Value); Require(b.DeliveredOn >= DateOnly.FromDateTime(a.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date), "交付日期不能早于采购"); }
        a.DeliveryState = b.State; a.DeliveredOn = b.DeliveredOn; a.Recipient = b.Recipient; a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow;
        return new { a.Id, a.DeliveryState, cashImpact = "0.00", version = a.Version.ToString(), rule = "退回实物仅变更交付状态；实际退款需从原业务结算处理。" };
    }
    public async Task<object> ResolveAdvance(string user, string id, AdvanceResolutionInput b, string? version, bool preview)
    {
        var a = await AdvanceEntity(user, id); Version(a, version); Require(a.BusinessId != null && b.Action is "Gift" or "WriteOff" or "MerchantRefund" && b.Reason.Trim().Length is > 0 and <= 2000, "代付调整类型或原因无效");
        var business = await BusinessEntity(user, a.BusinessId!); await RequireActiveBusiness(user, business); var amount = Money(b.Amount, true);
        Require(amount <= business.Principal - await Settled(user, business), "调整金额超过剩余应收");
        if (b.Action == "Gift") await Category(user, b.CategoryId ?? "", "Expense");
        if (b.Action == "MerchantRefund") Require(b.Settlement != null && Money(b.Settlement.Amount) == amount, "退货冲减应收需提供实际退款到账，且金额一致"); else Require(b.Settlement == null, "非现金减免不能提供收款交易");
        var refundAccount = b.Action == "MerchantRefund" ? await Account(user, b.Settlement!.AccountId) : null;
        if (refundAccount != null) Require(refundAccount.Currency == a.Currency && !(refundAccount.Type == "Receivable" || refundAccount.Type == "Payable" || refundAccount.Type == "ConsumerLoan" || refundAccount.Type == "SecuredLoan"), "商家退款账户或币种无效");
        if (preview) return new { a.Id, b.Action, amount = M(amount), cashImpact = M(refundAccount != null && !(refundAccount.Type == "CreditCard" || refundAccount.Type == "ConsumerCredit") ? amount : 0), liabilityImpact = M(refundAccount?.Type == "CreditCard" ? -amount : 0), expenseImpact = M(b.Action == "Gift" ? amount : 0), receivableImpact = M(-amount), preview };
        string transactionId;
        if (b.Action == "MerchantRefund")
        {
            var before = db.Transactions.Local.Select(x => x.Id).ToHashSet();
            await SettleBusiness(user, business.Id, b.Settlement!, business.Version.ToString(), stageGOperation: true);
            transactionId = db.Transactions.Local.Single(x => x.BusinessId == business.Id && !before.Contains(x.Id)).Id;
        }
        else
        {
            var contract = await Account(user, business.ContractAccountId, false);
            BusinessTransaction(user, business, contract, amount, DateTimeOffset.UtcNow, b.Reason, b.Action == "Gift" ? "Expense" : "AssetLoss", -1, 1, loss: true, categoryId: b.Action == "Gift" ? b.CategoryId : null);
            business.Version++; transactionId = db.Transactions.Local.Last(x => x.BusinessId == business.Id).Id;
        }
        db.Add(new AdvanceAdjustment { UserId = user, AdvanceId = id, TransactionId = transactionId, Action = b.Action, Amount = amount, Reason = b.Reason.Trim() });
        a.Version++; a.UpdatedAt = DateTimeOffset.UtcNow; return new { a.Id, transactionId, version = a.Version.ToString() };
    }
}



