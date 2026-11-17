using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> CorrectFundSettlement(string user, string id, StageGCorrectionInput b, string? version, bool preview)
    {
        Require(b.Reason.Trim().Length is > 0 and <= 2000, "请说明更正原因");
        var h = await db.Set<AccountFundHold>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "资金状态不存在"); Version(h, version);
        Require(h.State is "Confirmed" or "Settled", "已关闭或释放的项目不能直接更正结算，请先核对完整历史");
        var original = await db.Set<FundHoldEvent>().SingleOrDefaultAsync(x => x.UserId == user && x.HoldId == id && x.Id == b.EventId && x.Action == "Settle") ?? throw new ApiException(404, "实际结算事件不存在");
        Require(original.TransactionId != null && !await db.Set<FundHoldEvent>().AnyAsync(x => x.UserId == user && x.ReversalOfId == original.Id), "结算已经更正");
        var tx = await Transaction(user, original.TransactionId!); Require(tx.Status != "Deleted", "原结算流水已撤销");
        Require(!await db.Set<PrepaymentContract>().AnyAsync(x => x.UserId == user && x.FundingTransactionId == tx.Id) && !await db.Set<PrepaymentSettlement>().AnyAsync(x => x.UserId == user && x.TransactionId == tx.Id) && !await db.Set<PayrollPayment>().AnyAsync(x => x.UserId == user && x.TransactionId == tx.Id), "流水已被其他业务引用，请先解除引用再更正");
        if (preview) return new { h.Id, eventId = original.Id, amount = M(original.Amount), cashImpact = M(h.Type == "PendingCredit" ? -original.Amount : original.Amount), restoredRemaining = M(FundHoldRules.Remaining(h) + original.Amount), rule = "更正将受控撤销原实际结算流水并恢复未结算金额；原事件与更正事件均保留，后续可重新提交正确结算。", preview };
        await ChangeTransaction(user, tx.Id, false, tx.Version.ToString(), stageGOperation: true);
        h.SettledAmount -= original.Amount; h.State = "Confirmed"; h.Version++; h.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new FundHoldEvent { UserId = user, HoldId = id, Action = "Correction", Amount = original.Amount, ReversalOfId = original.Id, Reason = b.Reason.Trim() });
        return HoldView(h);
    }
    public async Task<object> CorrectPrepaymentSettlement(string user, string id, StageGCorrectionInput b, string? version, bool preview)
    {
        Require(b.Reason.Trim().Length is > 0 and <= 2000, "请说明更正原因");
        var p = await db.Set<PrepaymentContract>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "预付款不存在"); Version(p, version);
        var original = await db.Set<PrepaymentSettlement>().SingleOrDefaultAsync(x => x.UserId == user && x.ContractId == id && x.Id == b.EventId && x.ReversalOfId == null) ?? throw new ApiException(404, "原结算事件不存在");
        Require(!await db.Set<PrepaymentSettlement>().AnyAsync(x => x.UserId == user && x.ReversalOfId == original.Id), "结算已经更正");
        Require(original.Action is "Consume" or "Refund" or "WriteOff", "该事件不能更正");
        var cashImpact = original.TransactionId == null ? 0 : original.Action == "Refund" ? -original.Amount : 0;
        var liabilityImpact = 0m;
        if (original.TransactionId != null && original.Action == "Refund")
        {
            var refund = await Transaction(user, original.TransactionId);
            var target = await Account(user, refund.Type == "Transfer" ? refund.ToAccountId! : refund.AccountId!, false);
            if ((target.Type == "CreditCard" || target.Type == "ConsumerCredit")) { cashImpact = 0; liabilityImpact = original.Amount; }
        }
        Require(original.TransactionId == null || !await db.Set<FundHoldEvent>().AnyAsync(x => x.UserId == user && x.TransactionId == original.TransactionId), "流水已被资金状态结算引用，请先核对该关联");
        if (preview) return new { p.Id, eventId = original.Id, amount = M(original.Amount), cashImpact = M(cashImpact), liabilityImpact = M(liabilityImpact), restoredRemaining = M(PrepaymentRemaining(p) + original.Amount), rule = "更正撤销所选实际结算并恢复合同余额，预付资产回到原专用账户；历史跟踪的无流水事件仅恢复跟踪额。原记录始终保留。", preview };
        if (original.TransactionId != null) { var tx = await Transaction(user, original.TransactionId); await ChangeTransaction(user, tx.Id, false, tx.Version.ToString(), stageGOperation: true); }
        if (original.Action == "Consume") p.ConsumedAmount -= original.Amount; else if (original.Action == "Refund") p.RefundedAmount -= original.Amount; else p.WrittenOffAmount -= original.Amount;
        Require(p.ConsumedAmount >= 0 && p.RefundedAmount >= 0 && p.WrittenOffAmount >= 0, "合同历史金额不一致");
        p.State = "Active"; p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new PrepaymentSettlement { UserId = user, ContractId = id, Action = "Correction", Amount = original.Amount, ReversalOfId = original.Id, Reason = b.Reason.Trim() });
        return PrepaymentView(p);
    }
}


