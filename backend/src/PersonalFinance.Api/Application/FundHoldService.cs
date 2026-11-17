using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public static class FundHoldRules
{
    public static decimal Remaining(AccountFundHold h) => h.Amount - h.ReleasedAmount - h.SettledAmount;
    public static decimal AvailabilityDeduction(AccountFundHold h) => h.State == "Confirmed" && h.IncludedInBookBalance && h.ReducesAvailable && h.Type != "PendingCredit" ? Remaining(h) : 0;
    public static void Apply(AccountFundHold h, string action, decimal amount)
    {
        FinanceService.Require(amount >= 0 && amount <= Remaining(h), "资金状态金额超过剩余额度");
        if (action == "Confirm") { FinanceService.Require(h.State == "Draft" && amount == 0, "只有草稿可确认"); h.State = "Confirmed"; return; }
        FinanceService.Require(h.State == "Confirmed" || h.State == "Draft" && action is "Revoke" or "Expire", "资金状态不允许该操作");
        if (action is "Revoke" or "Expire") { FinanceService.Require(amount == 0, "关闭操作不接受金额"); h.ReleasedAmount += Remaining(h); h.State = action == "Revoke" ? "Revoked" : "Expired"; return; }
        FinanceService.Require(amount > 0 && action is "Release" or "Settle", "操作或金额无效");
        if (action == "Release") h.ReleasedAmount += amount; else h.SettledAmount += amount;
        if (Remaining(h) == 0) h.State = h.SettledAmount > 0 ? "Settled" : "Released";
    }
}
public sealed partial class FinanceService
{
    private static object HoldView(AccountFundHold h) => new { h.Id, h.AccountId, h.Type, h.Currency, amount = M(h.Amount),
        releasedAmount = M(h.ReleasedAmount), settledAmount = M(h.SettledAmount), remaining = M(FundHoldRules.Remaining(h)),
        h.IncludedInBookBalance, h.ReducesAvailable, h.State, h.Note, version = h.Version.ToString(), h.CreatedAt, h.UpdatedAt };
    public async Task<object> FundHolds(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<AccountFundHold>().AsNoTracking().Where(x => x.UserId == user);
        var accountId = query["accountId"].ToString(); if (accountId != "") q = q.Where(x => x.AccountId == accountId);
        var rows = await q.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(HoldView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> FundStatus(string user, string accountId)
    {
        var account = await Account(user, accountId, false); var balance = await Balance(user, accountId);
        var holds = await db.Set<AccountFundHold>().AsNoTracking().Where(x => x.UserId == user && x.AccountId == accountId && x.State == "Confirmed").ToArrayAsync();
        return new { accountId, account.Currency, bookBalance = M(balance), availableBalance = M(balance - holds.Sum(FundHoldRules.AvailabilityDeduction)),
            activeHolds = M(holds.Where(x => x.Type is "AuthorizationHold" or "AccountRestriction").Sum(FundHoldRules.Remaining)),
            pendingDebit = M(holds.Where(x => x.Type is "PendingDebit" or "SettlementPending").Sum(FundHoldRules.Remaining)),
            pendingCredit = M(holds.Where(x => x.Type == "PendingCredit").Sum(FundHoldRules.Remaining)),
            rule = "仅扣减已确认、明确减少可用且仍包含于账面余额的未结算项目；待到账不计余额；储蓄目标预留独立。" };
    }
    public async Task<object> CreateFundHold(string user, FundHoldInput b)
    {
        var a = await Account(user, b.AccountId); Require(a.Type is not ("Receivable" or "Payable" or "CreditCard" or "ConsumerCredit" or "ConsumerLoan" or "SecuredLoan"), "请选择资产资金账户；信用卡可用额度按既有额度口径展示");
        Require(b.Type is "AuthorizationHold" or "AccountRestriction" or "PendingDebit" or "PendingCredit" or "SettlementPending" && b.Note.Length <= 2000, "资金状态类型或备注无效");
        Require(b.Type != "PendingCredit" || !b.ReducesAvailable, "待到账不得减少可用资金");
        var h = new AccountFundHold { UserId = user, AccountId = a.Id, Currency = a.Currency, Type = b.Type, Amount = Money(b.Amount, true),
            IncludedInBookBalance = b.IncludedInBookBalance, ReducesAvailable = b.ReducesAvailable, Note = b.Note }; db.Add(h);
        db.Add(new FundHoldEvent { UserId = user, HoldId = h.Id, Action = "Create", Amount = h.Amount }); return HoldView(h);
    }
    public async Task<object> ChangeFundHold(string user, string id, FundHoldAction b, string? version, bool preview)
    {
        var h = await db.Set<AccountFundHold>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "资金状态不存在"); Version(h, version);
        Require(b.Reason.Trim().Length is > 0 and <= 2000, "请填写操作原因"); var amount = Money(b.Amount);
        // Preview validates on a detached copy. It must never mutate tracked state.
        var copy = new AccountFundHold { Amount = h.Amount, ReleasedAmount = h.ReleasedAmount, SettledAmount = h.SettledAmount, State = h.State };
        FundHoldRules.Apply(copy, b.Action, amount);
        string? transactionId = null;
        if (b.Action == "Settle")
        {
            Require(b.Transaction != null, "结算必须提供实际交易"); var t = b.Transaction!;
            Require(t.AccountId == h.AccountId && (h.Type == "PendingCredit" ? t.Type is "Income" or "Refund" : t.Type is "Expense" or "Transfer") &&
                Money(t.Amount) + (h.Type == "PendingCredit" ? 0 : Money(t.Fee)) == amount, "实际结算方向、账户或金额不一致");
            Require(!h.IncludedInBookBalance || h.Type != "PendingCredit", "待到账已包含于账面余额时只能释放说明项，不能再次入账");
            Require(h.IncludedInBookBalance || h.Type == "PendingCredit", "已从账面扣减的项目不能再次扣款，应核对既有流水");
            Require(t.OccurredAt >= h.CreatedAt, "结算时间不能早于冻结创建时间");
            if (!preview) { var result = await SaveTransaction(user, t); transactionId = System.Text.Json.JsonSerializer.SerializeToElement(result, Json).GetProperty("id").GetString(); }
        }
        else Require(b.Transaction == null, "非结算动作不接受资金交易");
        if (preview) return new { h.Id, before = HoldView(h), afterState = copy.State, remaining = M(FundHoldRules.Remaining(copy)), cashImpact = M(b.Action == "Settle" ? (h.Type == "PendingCredit" ? amount : -amount) : 0), preview };
        var eventAmount = b.Action is "Revoke" or "Expire" ? FundHoldRules.Remaining(h) : amount;
        FundHoldRules.Apply(h, b.Action, amount); h.Version++; h.UpdatedAt = DateTimeOffset.UtcNow;
        db.Add(new FundHoldEvent { UserId = user, HoldId = h.Id, Action = b.Action, Amount = eventAmount, TransactionId = transactionId, Reason = b.Reason.Trim() });
        return HoldView(h);
    }
    public async Task<object> FundHoldHistory(string user, string id)
    {
        Require(await db.Set<AccountFundHold>().AnyAsync(x => x.UserId == user && x.Id == id), "资金状态不存在");
        var events = await db.Set<FundHoldEvent>().AsNoTracking().Where(x => x.UserId == user && x.HoldId == id).OrderBy(x => x.CreatedAt).ToArrayAsync();
        return events.Select(x => new { x.Id, x.Action, amount = M(x.Amount), x.TransactionId, x.ReversalOfId, x.Reason, x.CreatedAt }).ToArray();
    }
}
