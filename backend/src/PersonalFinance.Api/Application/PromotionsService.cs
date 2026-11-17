using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> SubsidizedTransferDraft(string user, SubsidizedTransfer input)
    {
        var source = await Account(user, input.AccountId); var target = await Account(user, input.ToAccountId);
        Require(source.Id != target.Id && source.Currency == target.Currency && source.Type is not ("Receivable" or "Payable" or "CreditCard" or "ConsumerCredit" or "ConsumerLoan" or "SecuredLoan") && target.Type is not ("Receivable" or "Payable" or "CreditCard" or "ConsumerCredit" or "ConsumerLoan" or "SecuredLoan"), "补贴草稿首版仅支持同币种自有现金账户");
        var paid = Money(input.PaidAmount, true); var received = Money(input.ReceivedAmount, true); var subsidy = Money(input.SubsidyAmount, true);
        Require(paid + subsidy == received && input.Source.Length is > 0 and <= 200 && input.Evidence.Length is > 0 and <= 2000, "补贴须解释转账差额并填写来源和业务凭据");
        var draft = new PromotionTransferDraft { UserId = user, AccountId = source.Id, ToAccountId = target.Id, Currency = source.Currency, PaidAmount = paid, ReceivedAmount = received, SubsidyAmount = subsidy, Source = input.Source, Evidence = input.Evidence, OccurredAt = input.OccurredAt };
        db.Add(draft); return new { draft.Id, draft.State, ledgerPosted = false };
    }
    public async Task<object> ConfirmTransferDraft(string user, string id, ConfirmSubsidizedTransfer input, string? version)
    {
        var draft = await db.Set<PromotionTransferDraft>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "补贴草稿不存在"); Version(draft, version);
        Require(draft.State == "PendingConfirmation" && input.Nature == "RewardIncome", "草稿已处理；首版仅支持确认真实现金补贴作为活动奖励收入");
        await Category(user, input.CategoryId, "Income");
        var transfer = await SaveTransaction(user, new SaveTransaction("Transfer", M(draft.PaidAmount), draft.AccountId, draft.OccurredAt, Note: "补贴转账：" + draft.Source, ToAccountId: draft.ToAccountId));
        var subsidy = await SaveTransaction(user, new SaveTransaction("Income", M(draft.SubsidyAmount), draft.ToAccountId, draft.OccurredAt, Note: "第三方现金补贴：" + draft.Source, CategoryId: input.CategoryId));
        draft.TransferTransactionId = JsonSerializer.SerializeToElement(transfer, Json).GetProperty("id").GetString(); draft.SubsidyTransactionId = JsonSerializer.SerializeToElement(subsidy, Json).GetProperty("id").GetString(); draft.State = "Posted"; draft.Version++;
        return new { draft.Id, draft.TransferTransactionId, draft.SubsidyTransactionId, draft.State };
    }
    string BenefitState(PromotionBenefit b) => b.State != "Active" ? b.State : b.ExpiresAt < DateTimeOffset.UtcNow ? "Expired" : b.StartsAt > DateTimeOffset.UtcNow ? "NotStarted" : b.Quantity == 0 || b.Mode == "Balance" && b.RemainingValue == 0 ? "Used" : "Available";
    object BenefitDto(PromotionBenefit b) => new { b.Id, b.Name, b.Platform, b.Merchant, b.Type, b.Mode, b.Currency, faceValue = M(b.FaceValue), minimumAmount = M(b.MinimumAmount), discountRate = b.DiscountRate == null ? null : M(b.DiscountRate.Value), maximumDiscount = b.MaximumDiscount == null ? null : M(b.MaximumDiscount.Value), b.ClaimedAt, b.PaymentMethod, remainingValue = M(b.RemainingValue), b.Quantity, b.AccountId, b.StartsAt, b.ExpiresAt, state = BenefitState(b), b.Rules, b.Note, version = b.Version.ToString() };
    public async Task<object[]> Promotions(string user) => (await db.Set<PromotionBenefit>().AsNoTracking().Where(x => x.UserId == user).OrderBy(x => x.ExpiresAt).ToListAsync()).Select(BenefitDto).ToArray();
    public async Task<object> RevokeTransferDraft(string user, string id, string? version)
    {
        var draft = await db.Set<PromotionTransferDraft>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "补贴草稿不存在"); Version(draft, version);
        Require(draft.State is "PendingConfirmation" or "Posted", "草稿已撤销");
        if (draft.State == "Posted") {
            var transfer = await Transaction(user, draft.TransferTransactionId!); var subsidy = await Transaction(user, draft.SubsidyTransactionId!);
            await ChangeTransaction(user, transfer.Id, false, transfer.Version.ToString(), promotionCompositeOperation: true);
            await ChangeTransaction(user, subsidy.Id, false, subsidy.Version.ToString(), promotionCompositeOperation: true);
        }
        draft.State = "Revoked"; draft.Version++; return new { draft.Id, draft.State };
    }
    public async Task<object> SavePromotion(string user, SavePromotion input, string? id, string? version)
    {
        Require(input.Name.Trim().Length is > 0 and <= 150 && input.Platform.Length <= 200 && input.Merchant.Length <= 200 && input.Rules.Length <= 2000 && input.Note.Length <= 2000, "优惠档案信息无效");
        Require(PromotionMath.Types.Contains(input.Type) && input.Mode is "Single" or "Reusable" or "Balance" && input.State is "Active" or "Paused" or "Void", "优惠类型、库存模式或状态无效");
        Require(CurrencyDefinitions.Supports(input.Currency) && input.Quantity is >= 0 and <= 100000 && (id != null || input.Quantity > 0) && input.StartsAt <= input.ExpiresAt, "币种、数量或有效期无效");
        var face = Money(input.FaceValue); var minimum = Money(input.MinimumAmount); Require(face >= 0 && minimum >= 0, "权益面额不可为负");
        var rate = string.IsNullOrEmpty(input.DiscountRate) ? (decimal?)null : Money(input.DiscountRate);
        var maximum = string.IsNullOrEmpty(input.MaximumDiscount) ? (decimal?)null : Money(input.MaximumDiscount);
        Require(rate == null || rate > 0 && rate < 100, "折扣后支付比例须大于0、小于100，例如85代表85折");
        Require(maximum == null || maximum > 0, "最高优惠金额须大于0");
        Require((input.PaymentMethod?.Length ?? 0) <= 40 && (input.PaymentMethod == null || new[] { "Cash", "Bank", "CreditCard", "Alipay", "WeChat", "StoredValue", "Other" }.Contains(input.PaymentMethod)), "支付方式无效");
        Require(input.Mode != "Balance" || rate == null && input.Quantity == 1, "余额权益仅支持金额型且数量须为1");
        if (input.AccountId is not null) Require((await Account(user, input.AccountId)).Currency == input.Currency, "适用账户币种不同");
        var b = id is null ? new PromotionBenefit { UserId = user, RemainingValue = face } : await Benefit(user, id);
        if (id is not null) { Version(b, version); Require(b.Mode == input.Mode && b.Currency == input.Currency && b.Type == input.Type, "已有权益不能改变核算模式或币种类型"); Require(b.Quantity == input.Quantity && b.FaceValue == face, "已有库存不可通过编辑补充；请新建领取记录"); b.Version++; }
        b.DiscountRate = rate; b.MaximumDiscount = maximum; b.ClaimedAt = input.ClaimedAt; b.PaymentMethod = input.PaymentMethod; b.Name = input.Name.Trim(); b.Platform = input.Platform; b.Merchant = input.Merchant; b.Type = input.Type; b.Mode = input.Mode; b.Currency = input.Currency; b.FaceValue = face; b.MinimumAmount = minimum; b.Quantity = input.Quantity; b.AccountId = input.AccountId; b.StartsAt = input.StartsAt; b.ExpiresAt = input.ExpiresAt; b.State = input.State; b.Rules = input.Rules; b.Note = input.Note;
        if (id is null) db.Add(b); return BenefitDto(b);
    }
    async Task<PromotionBenefit> Benefit(string user, string id) => await db.Set<PromotionBenefit>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "权益不存在");
    public async Task<object> PromotionHistory(string user, string id)
    {
        await Benefit(user, id);
        return await db.Set<PromotionUsage>().AsNoTracking().Where(x => x.UserId == user && x.BenefitId == id).OrderByDescending(x => x.CreatedAt).Select(x => new { x.Id, x.TransactionId, amount = M(x.Amount), x.State, x.CreatedAt, version = x.Version.ToString() }).ToArrayAsync();
    }
    async Task ApplyBenefits(string user, FinanceTransaction t, PromotionInput? input, bool restore = false)
    {
        var previous = await db.Set<PromotionUsage>().Where(x => x.UserId == user && x.TransactionId == t.Id).ToListAsync();
        if (!restore && input != null) foreach (var line in input.Lines.Where(x => x.BenefitId != null && !previous.Any(p => p.BenefitId == x.BenefitId && p.State is "Used" or "ReturnRevoked"))) Version(await Benefit(user, line.BenefitId!), line.BenefitVersion);
        foreach (var usage in previous.Where(x => x.State is "Used" or "ReturnRevoked")) { var b = await Benefit(user, usage.BenefitId); if (b.Mode != "Reusable") b.Quantity++; if (b.Mode == "Balance") { b.Quantity = 1; b.RemainingValue += usage.Amount; } b.Version++; usage.State = usage.State == "ReturnRevoked" ? "UsageRevokedReturn" : "Revoked"; usage.Version++; }
        if (input is null) return;
        var ids = input.Lines.Where(x => x.BenefitId is not null).Select(x => x.BenefitId).ToArray();
        Require(ids.Distinct().Count() == ids.Length, "同一权益不能在一笔交易中重复使用");
        foreach (var line in input.Lines.Where(x => x.BenefitId is not null))
        {
            var b = await Benefit(user, line.BenefitId!);
            Require(BenefitState(b) == "Available" && b.Currency == t.Currency && (b.AccountId is null || b.AccountId == t.AccountId) && b.Type == line.Type && (b.Merchant.Length == 0 || b.Merchant == t.Merchant), "权益不可用、商户账户或类型不匹配");
            Require(Money(input.OriginalAmount) >= b.MinimumAmount, "未达到权益最低金额");
            var value = Money(line.Amount, true); Require(value <= (b.Mode == "Balance" ? b.RemainingValue : b.DiscountRate == null ? b.FaceValue : decimal.MaxValue), "抵扣超过权益额度");
            Require(b.PaymentMethod == null || (await Account(user, t.AccountId)).Type == b.PaymentMethod, "该权益不适用当前支付方式");
            Require(b.MaximumDiscount == null || value <= b.MaximumDiscount, "抵扣超过最高优惠金额");
            if (b.DiscountRate != null) Require(value == PromotionMath.RateDiscount(PromotionMath.EligibleAmount(input, line), b.DiscountRate.Value, b.MaximumDiscount), "折扣金额与折扣率、应用顺序或封顶规则不一致");
            if (b.Mode == "Balance") b.RemainingValue -= value; else if (b.Mode == "Single") b.Quantity--;
            var recovery = previous.LastOrDefault(x => x.BenefitId == b.Id && x.State == "UsageRevokedReturn");
            b.Version++; db.Add(new PromotionUsage { UserId = user, BenefitId = b.Id, TransactionId = t.Id, Amount = value, State = recovery == null ? "Used" : "ReturnRevoked", RefundTransactionId = recovery?.RefundTransactionId });
        }
    }
    public async Task<object> ReturnBenefit(string user, string usageId, ReturnPromotion input, string? version)
    {
        var usage = await db.Set<PromotionUsage>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == usageId) ?? throw new ApiException(404, "使用记录不存在"); Version(usage, version);
        var refund = await Transaction(user, input.RefundTransactionId);
        Require(usage.State == "Used" && refund.Type == "Refund" && refund.Status != "Deleted" && refund.OriginalTransactionId == usage.TransactionId, "须关联有效退款且权益未返还");
        var b = await Benefit(user, usage.BenefitId); Require(b.Mode != "Reusable", "重复使用权益无需返还库存");
        if (b.Mode == "Balance") b.RemainingValue += usage.Amount; else b.Quantity++;
        b.Version++; usage.RefundTransactionId = refund.Id; usage.State = "Returned"; usage.Version++; return new { usage.Id };
    }
    async Task ChangeRefundBenefits(string user, string id, bool restore)
    {
        var usages = await db.Set<PromotionUsage>().Where(x => x.UserId == user && x.RefundTransactionId == id && x.State == (restore ? "ReturnRevoked" : "Returned")).ToListAsync();
        foreach (var usage in usages)
        {
            var b = await Benefit(user, usage.BenefitId);
            if (restore) { if (b.Mode == "Balance") b.RemainingValue += usage.Amount; else b.Quantity++; usage.State = "Returned"; }
            else { Require(b.Mode == "Balance" ? b.RemainingValue >= usage.Amount : b.Quantity > 0, "返还权益已再次使用，须先撤销后续使用交易"); if (b.Mode == "Balance") b.RemainingValue -= usage.Amount; else b.Quantity--; usage.State = "ReturnRevoked"; }
            b.Version++; usage.Version++;
        }
    }
    public async Task<object> CreateCashback(string user, CreateCashback input)
    {
        var t = await Transaction(user, input.TransactionId); Require(!await db.Set<CashbackRecovery>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id), "追回流水不可登记新的返现"); Require(t.Type == "Expense" && t.Status != "Deleted" && input.Treatment is "PriceAdjustment" or "RewardIncome", "返现须关联有效消费并指定统计方式");
        Require(input.Source.Length is > 0 and <= 200, "返现来源必填");
        var b = new CashbackReceivable { UserId = user, TransactionId = t.Id, Currency = t.Currency, Amount = Money(input.Amount, true), Source = input.Source, Treatment = input.Treatment, ExpiresAt = input.ExpiresAt };
        Require(b.Treatment != "PriceAdjustment" || b.Amount <= t.Amount, "价格调整返现不能超过实际消费"); db.Add(b); return new { b.Id };
    }
    public async Task<object> RevokeCashback(string user, string id, string? version)
    {
        var b = await db.Set<CashbackReceivable>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "返现不存在"); Version(b, version);
        Require(b.State is "Pending" or "Settled", "返现已撤销");
        Require(b.RecoveredAmount == 0, "已有追回记录，请通过剩余金额追回处理，不能重复撤销原到账");
        if (b.State == "Settled") {
            var receipt = await Transaction(user, b.SettlementTransactionId!);
            await ChangeTransaction(user, receipt.Id, false, receipt.Version.ToString(), cashbackOperation: true);
        }
        b.State = "Revoked"; b.Version++; return new { b.Id };
    }
    public async Task<object> RecoverCashback(string user, string id, RecoverCashback input, string? version)
    {
        var b = await db.Set<CashbackReceivable>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "返现不存在"); Version(b, version);
        var amount = Money(input.Amount, true);
        Require(b.State == "Settled" && b.RecoveredAmount + amount <= b.Amount, "追回金额超过剩余已到账返现");
        Require(input.Reason.Trim().Length is > 0 and <= 2000, "须填写实际追回原因");
        var account = await Account(user, input.AccountId); Require(account.Currency == b.Currency && !(account.Type == "Receivable" || account.Type == "Payable" || account.Type == "ConsumerLoan" || account.Type == "SecuredLoan"), "追回账户币种或类型无效");
        var receipt = await Transaction(user, b.SettlementTransactionId!); Require(receipt.Status != "Deleted" && input.OccurredAt >= receipt.OccurredAt, "追回时间不能早于实际到账");
        Split[]? splits = null;
        if (b.Treatment == "PriceAdjustment") {
            var remaining = amount; var lines = receipt.Entries.Where(x => x.Kind == "Expense").OrderBy(x => x.CategoryId).ToArray(); var allocation = new List<Split>();
            for (int i = 0; i < lines.Length; i++) { var share = i == lines.Length - 1 ? remaining : decimal.Floor(amount * Math.Abs(lines[i].Amount) / b.Amount * 100) / 100; if (share > 0) allocation.Add(new(lines[i].CategoryId!, M(share))); remaining -= share; }
            Require(remaining == 0, "原返现费用分配无效"); splits = allocation.ToArray();
        }
        var result = await SaveTransaction(user, new SaveTransaction(b.Treatment == "PriceAdjustment" ? "Expense" : "RewardReversal", M(amount), account.Id, input.OccurredAt, Note: "返现追回：" + input.Reason, CategoryId: receipt.CategoryId, Splits: splits), internalOperation: true);
        var transactionId = JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString()!;
        db.Add(new CashbackRecovery { UserId = user, CashbackId = b.Id, TransactionId = transactionId, Amount = amount, Reason = input.Reason }); b.RecoveredAmount += amount; b.Version++; return result;
    }
    public async Task<object> RevokeCashbackRecovery(string user, string id, string? version)
    {
        var recovery = await db.Set<CashbackRecovery>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "追回记录不存在"); Version(recovery, version);
        Require(recovery.State == "Active", "追回已撤销");
        var b = await db.Set<CashbackReceivable>().SingleAsync(x => x.UserId == user && x.Id == recovery.CashbackId);
        var t = await Transaction(user, recovery.TransactionId);
        if (b.Treatment == "PriceAdjustment") {
            var original = await Transaction(user, b.TransactionId); var recoveries = (await PriceRecoveryTransactions(user, original.Id)).Where(x => x.Id != t.Id).ToArray();
            var refunds = await db.Transactions.Include(x => x.Entries).Where(x => x.UserId == user && x.OriginalTransactionId == original.Id && x.Status != "Deleted").ToListAsync();
            Require(refunds.Sum(x => x.Amount) <= original.Amount + recoveries.Sum(x => x.Amount), "后续退款已使用追回恢复的额度，须先处理后续退款");
            foreach (var g in original.Entries.Where(x => x.Kind == "Expense").GroupBy(x => x.CategoryId)) Require(g.Sum(x => x.Amount) + refunds.Concat(recoveries).SelectMany(x => x.Entries).Where(x => x.Kind == "Expense" && x.CategoryId == g.Key).Sum(x => x.Amount) >= 0, "后续分类退款已使用追回恢复的额度");
        }
        await ChangeTransaction(user, t.Id, false, t.Version.ToString(), cashbackOperation: true);
        recovery.State = "Revoked"; recovery.Version++; b.RecoveredAmount -= recovery.Amount; b.Version++;
        return new { recovery.Id };
    }
    private async Task<List<FinanceTransaction>> PriceRecoveryTransactions(string user, string originalId)
    {
        var ids = from r in db.Set<CashbackRecovery>() join b in db.Set<CashbackReceivable>() on r.CashbackId equals b.Id
                  where r.UserId == user && b.UserId == user && b.TransactionId == originalId && b.Treatment == "PriceAdjustment" && r.State == "Active" select r.TransactionId;
        return await db.Transactions.Include(x => x.Entries).Where(x => x.UserId == user && ids.Contains(x.Id) && x.Status != "Deleted").ToListAsync();
    }
    public async Task<object> CashbackRecoveries(string user, string id)
    {
        Require(await db.Set<CashbackReceivable>().AnyAsync(x => x.UserId == user && x.Id == id), "返现不存在");
        return await db.Set<CashbackRecovery>().Where(x => x.UserId == user && x.CashbackId == id).Select(x => new { x.Id, x.TransactionId, amount = M(x.Amount), x.Reason, x.State, version = x.Version.ToString() }).ToArrayAsync();
    }
    public async Task<object> TransactionPromotions(string user, string id)
    {
        var t = await Transaction(user, id);
        var promotion = t.PromotionJson == null ? null : JsonSerializer.Deserialize<PromotionInput>(t.PromotionJson, Json);
        var expenses = t.Entries.Where(x => x.Kind == "Expense").GroupBy(x => x.CategoryId).OrderBy(x => x.Key).Select(g => new { categoryId = g.Key, net = g.Sum(x => x.Amount) }).ToArray();
        var allocation = new List<object>();
        if (promotion != null && t.Type == "Expense") foreach (var line in promotion.Lines) {
            var remaining = Money(line.Amount);
            for (int i = 0; i < expenses.Length; i++) {
                var share = i == expenses.Length - 1 ? remaining : decimal.Floor(Money(line.Amount) * expenses[i].net / t.Amount * 100) / 100;
                remaining -= share; allocation.Add(new { expenses[i].categoryId, line.Type, line.Order, amount = M(share), rule = "按净费用比例分摊，分类ID排序，尾项吸收分差" });
            }
        }
        return new { promotion, allocation, cashbacks = (await Cashbacks(user)).Where(x => JsonSerializer.SerializeToElement(x, Json).GetProperty("transactionId").GetString() == id), usages = await db.Set<PromotionUsage>().Where(x => x.UserId == user && x.TransactionId == id).Select(x => new { x.Id, x.BenefitId, x.RefundTransactionId, x.State, amount = M(x.Amount), version = x.Version.ToString() }).ToArrayAsync() };
    }
    public async Task<object[]> Cashbacks(string user) => (await db.Set<CashbackReceivable>().AsNoTracking().Where(x => x.UserId == user).ToListAsync()).Select(x => (object)new { x.Id, x.TransactionId, x.SettlementTransactionId, amount = M(x.Amount), recoveredAmount = M(x.RecoveredAmount), remainingAmount = M(x.Amount - x.RecoveredAmount), x.Currency, x.Source, x.Treatment, state = x.State == "Settled" && x.RecoveredAmount > 0 ? (x.RecoveredAmount == x.Amount ? "Recovered" : "PartiallyRecovered") : x.State == "Pending" && x.ExpiresAt < DateTimeOffset.UtcNow ? "Expired" : x.State, x.ExpiresAt, version = x.Version.ToString() }).ToArray();
    public async Task<object> SettleCashback(string user, string id, SettleCashback input, string? version)
    {
        var b = await db.Set<CashbackReceivable>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "返现不存在"); Version(b, version);
        Require(b.State == "Pending" && (b.ExpiresAt is null || b.ExpiresAt >= DateTimeOffset.UtcNow), "返现已处理或失效");
        var original = await Transaction(user, b.TransactionId); Require(original.Status != "Deleted", "原消费已撤销");
        var account = await Account(user, input.AccountId); Require(account.Currency == b.Currency, "返现账户币种不同");
        var result = await SaveTransaction(user, new SaveTransaction(b.Treatment == "PriceAdjustment" ? "Refund" : "Income", M(b.Amount), account.Id, input.OccurredAt, Note: "返现到账：" + b.Source, CategoryId: input.CategoryId, OriginalTransactionId: b.Treatment == "PriceAdjustment" ? original.Id : null));
        b.SettlementTransactionId = JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); b.State = "Settled"; b.Version++; return result;
    }
    public async Task<object> PromotionReport(string user, IQueryCollection query)
    {
        var currency = query["currency"].ToString(); if (currency == "") currency = "CNY"; Require(CurrencyDefinitions.Supports(currency), "币种无效");
        var start = query["start"].ToString(); var end = query["end"].ToString(); Require(start.Length > 0 && end.Length > 0, "请指定优惠报表起止日期");
        var from = Date(start); var to = Date(end).AddDays(1); Require(to > from, "报表日期范围无效");
        var rows = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Status != "Deleted" && x.Currency == currency && x.PromotionJson != null && x.OccurredAt >= from && x.OccurredAt < to).ToListAsync();
        var details = rows.SelectMany(t => JsonSerializer.Deserialize<PromotionInput>(t.PromotionJson!, Json)!.Lines.Select(line => new { transactionId = t.Id, t.Merchant, month = t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"), line.Type, line.Source, amount = M(Money(line.Amount)) })).ToArray();
        var cashback = await db.Set<CashbackReceivable>().Where(x => x.UserId == user && x.Currency == currency).ToListAsync();
        var settledIds = cashback.Where(x => x.State == "Settled").Select(x => x.SettlementTransactionId).ToArray();
        var settled = await db.Transactions.Where(x => x.UserId == user && x.Status != "Deleted" && settledIds.Contains(x.Id) && x.OccurredAt >= from && x.OccurredAt < to).SumAsync(x => (decimal?)x.Amount) ?? 0;
        var recoveryTotal = await (from r in db.Set<CashbackRecovery>() join tx in db.Transactions on r.TransactionId equals tx.Id where r.UserId == user && r.State == "Active" && tx.UserId == user && tx.Status != "Deleted" && tx.Currency == currency && tx.OccurredAt >= @from && tx.OccurredAt < to select (decimal?)r.Amount).SumAsync() ?? 0;
        var benefits = await db.Set<PromotionBenefit>().Where(x => x.UserId == user && x.Currency == currency).ToListAsync();
        var usageCount = await (from usage in db.Set<PromotionUsage>() join tx in db.Transactions on usage.TransactionId equals tx.Id where usage.UserId == user && usage.State == "Used" && tx.Currency == currency && tx.Status != "Deleted" && tx.OccurredAt >= @from && tx.OccurredAt < to select usage.Id).CountAsync();
        return new { currency, recoveredCashback = M(recoveryTotal), netCashback = M(settled - recoveryTotal), originalReference = M(rows.Where(t => t.Type == "Expense").Sum(t => Money(JsonSerializer.Deserialize<PromotionInput>(t.PromotionJson!, Json)!.OriginalAmount))), actualPayment = M(rows.Where(t => t.Type == "Expense").Sum(t => t.Amount)), couponUsageCount = usageCount, expiredUnusedCount = benefits.Count(b => BenefitState(b) == "Expired" && b.Quantity > 0), unusedEntitlementValue = M(benefits.Where(b => BenefitState(b) == "Available" && b.Mode != "Reusable").Sum(b => b.Mode == "Balance" ? b.RemainingValue : b.Quantity * b.FaceValue)), directSavings = M(details.Where(x => x.Type is not ("FeeWaiver" or "PointDeduction" or "GiftCredit")).Sum(x => Money(x.amount))), giftCreditUsed = M(details.Where(x => x.Type == "GiftCredit").Sum(x => Money(x.amount))), feeSavings = M(details.Where(x => x.Type == "FeeWaiver").Sum(x => Money(x.amount))), pointValue = M(details.Where(x => x.Type == "PointDeduction").Sum(x => Money(x.amount))), settledCashback = M(settled), pendingCashback = M(cashback.Where(x => x.State == "Pending" && (x.ExpiresAt == null || x.ExpiresAt >= DateTimeOffset.UtcNow)).Sum(x => x.Amount)), trend = details.GroupBy(x => x.month).Select(g => new { month = g.Key, directSavings = M(g.Where(x => x.Type is not ("FeeWaiver" or "PointDeduction" or "GiftCredit")).Sum(x => Money(x.amount))), feeSavings = M(g.Where(x => x.Type == "FeeWaiver").Sum(x => Money(x.amount))), pointValue = M(g.Where(x => x.Type == "PointDeduction").Sum(x => Money(x.amount))) }), details };
    }
}







