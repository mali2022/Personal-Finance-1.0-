using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record CustomDebtRow(DateOnly Date, string Principal, string Fee);
public sealed record DebtPlanInput(string Kind, string AccountId, string? BusinessId, string? OriginalTransactionId, string Name, string Principal, int Periods, DateOnly FirstDate, string RepaymentMode, string FeeMode, string Parameter, string State, string Note, CustomDebtRow[]? CustomSchedule = null, string? StatementAmount = null, string? MinimumPayment = null, DateOnly? MinimumDueDate = null);
public sealed record PayoffInput(string RemainingPrincipal, string ConfirmedFee, string Explanation);
public sealed partial class FinanceService
{
    private static object DebtPlanView(DebtRepaymentPlan p) => new { p.Id, p.Kind, p.AccountId, p.BusinessId, p.OriginalTransactionId, p.Name, p.Currency, principal = M(p.Principal), p.Periods, p.FirstDate, p.RepaymentMode, p.FeeMode, parameter = p.FeeMode == "FixedPerPeriod" ? M(p.FixedFee) : p.PeriodRate.ToString("0.########", CultureInfo.InvariantCulture), p.State, p.Note, statementAmount = p.StatementAmount.HasValue ? M(p.StatementAmount.Value) : null, minimumPayment = p.MinimumPayment.HasValue ? M(p.MinimumPayment.Value) : null, p.MinimumDueDate, version = p.Version.ToString(), p.CreatedAt, p.UpdatedAt, p.PrincipalBaselineAt };
    private async Task<DebtRepaymentPlan> DebtPlan(string user, string id) => await db.Set<DebtRepaymentPlan>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "偿还计划不存在");
    public async Task<object> DebtPlans(string user, IQueryCollection query, string? kind = null) {
        var (page, size) = Paging(query); var currency = query["currency"].ToString(); Require(CurrencyDefinitions.Supports(currency), "请明确币种");
        var q = db.Set<DebtRepaymentPlan>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency && (kind == null || x.Kind == kind));
        var accountId = query["accountId"].ToString(); var businessId = query["businessId"].ToString();
        if (accountId.Length > 0) q = q.Where(x => x.AccountId == accountId);
        if (businessId.Length > 0) q = q.Where(x => x.BusinessId == businessId);
        var rows = await q.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(DebtPlanView), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SaveDebtPlan(string user, string? id, DebtPlanInput input, string? version) {
        Require(input.Kind is "CreditInstallment" or "LoanRepayment" && !string.IsNullOrWhiteSpace(input.Name) && input.Name.Length <= 150 && input.Note is { Length: <= 2000 } && input.State is "Active" or "Archived", "计划类型、名称或状态无效");
        var principal = Money(input.Principal, true); Require(input.Periods is >= 1 and <= 600 && input.FirstDate.Year is >= 1900 and <= 9900, "期数或日期无效");
        Require(input.Parameter != null && System.Text.RegularExpressions.Regex.IsMatch(input.Parameter, @"^\d{1,10}(\.\d{1,8})?$") && decimal.TryParse(input.Parameter, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out _), "计费参数无效");
        var parameter = decimal.Parse(input.Parameter!, CultureInfo.InvariantCulture); Require(input.FeeMode != "None" || parameter == 0, "无费用模式的参数应为0"); Require(input.FeeMode != "Custom" || parameter == 0, "自定义费用请在每期表中输入，参数应为0"); var account = await Account(user, input.AccountId, false);
        var row = id == null ? new DebtRepaymentPlan { UserId = user } : await DebtPlan(user, id);
        if (id != null) { Version(row, version); Require(row.Kind == input.Kind && row.AccountId == input.AccountId && row.BusinessId == input.BusinessId && row.OriginalTransactionId == input.OriginalTransactionId, "计划来源不可更换，请归档后新建"); }
        else Require(version == "0", "新计划版本应为0");
        if (id != null && principal != row.Principal)
        {
            Require(!await db.Set<DebtPaymentAllocation>().AnyAsync(x => x.UserId == user && x.PlanId == id && x.State == "Active"), "更改本金基准前请撤销旧核对关联，历史真实交易保留");
        }
        if (input.Kind == "CreditInstallment") {
            Require((account.Type == "CreditCard" || account.Type == "ConsumerCredit") && input.BusinessId == null, "请选择信用卡，分期不得关联借贷业务");
            if (input.OriginalTransactionId != null) {
                var t = await Transaction(user, input.OriginalTransactionId); Require(t.Type == "Expense" && t.AccountId == account.Id && t.Status != "Deleted", "原消费与信用卡不匹配");
                Require(input.FirstDate >= DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime), "分期首期日期不能早于原消费");
                var refunded = await db.Transactions.Where(x => x.UserId == user && x.OriginalTransactionId == t.Id && x.Status != "Deleted").SumAsync(x => (decimal?)x.Amount) ?? 0;
                if (input.State == "Active") Require(principal <= t.Amount - refunded, "计划本金超过原消费退款后的金额，请按合同更正计划");
            }
            if (input.State == "Active") {
                var other = db.Set<DebtRepaymentPlan>().Where(x => x.UserId == user && x.Id != row.Id && x.AccountId == account.Id && x.Kind == "CreditInstallment" && x.State == "Active");
                Require(!await other.AnyAsync(x => input.OriginalTransactionId == null || x.OriginalTransactionId == null || x.OriginalTransactionId == input.OriginalTransactionId), "已有互相冲突的消费或整卡债务安排");
                if (id == null || principal != row.Principal) Require(principal + (await other.SumAsync(x => (decimal?)x.Principal) ?? 0) <= Math.Max(0, -(await Balance(user, account.Id))), "计划本金不能超过当前信用卡欠款；已还款但未核对计划需先归档或更正");
            }
        } else {
            Require(input.BusinessId != null && input.OriginalTransactionId == null, "请选择已有借出或借入业务");
            var business = await BusinessEntity(user, input.BusinessId!); Require(business.Kind is "Lent" or "Borrowed" && business.AccountId == account.Id, "借贷业务与原资金账户不匹配");
            Require(input.FirstDate >= DateOnly.FromDateTime(business.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime), "还款首期日期不能早于借贷发生");
            if (input.State == "Active") { await RequireActiveBusiness(user, business); Require(principal <= business.Principal - await Settled(user, business), "计划本金不能超过实际剩余本金"); Require(!await db.Set<DebtRepaymentPlan>().AnyAsync(x => x.UserId == user && x.Id != row.Id && x.BusinessId == business.Id && x.State == "Active"), "该借贷已有有效计划"); }
        }
        List<DebtScheduleRow> schedule;
        if (input.RepaymentMode == "Custom") {
            Require(input.FeeMode == "Custom" && input.CustomSchedule != null && input.CustomSchedule.Length == input.Periods, "自定义计划需逐期填写本金和费用");
            schedule = []; var remaining = principal; DateOnly? prior = null;
            foreach (var r in input.CustomSchedule!) { var part = Money(r.Principal); var fee = Money(r.Fee); Require(part >= 0 && part <= remaining && fee >= 0 && r.Date.Year is >= 1900 and <= 9900 && (prior == null || r.Date > prior), "自定义计划日期必须递增，金额不可负或超过本金"); schedule.Add(new(schedule.Count + 1, r.Date, remaining, part, fee, remaining - part)); remaining -= part; prior = r.Date; }
            Require(remaining == 0 && schedule[0].Date == input.FirstDate, "自定义本金总额或首期日期不一致");
        } else { Require(input.CustomSchedule == null || input.CustomSchedule.Length == 0, "生成式计划不可携带自定义期表"); schedule = DebtScheduleMath.Generate(principal, input.Periods, input.FirstDate, input.RepaymentMode, input.FeeMode, parameter); }
        var statement = input.StatementAmount == null ? null : (decimal?)Money(input.StatementAmount); var minimum = input.MinimumPayment == null ? null : (decimal?)Money(input.MinimumPayment);
        Require(input.Kind == "CreditInstallment" || statement == null && minimum == null && input.MinimumDueDate == null, "最低还款记录仅用于信用卡");
        Require(input.MinimumDueDate == null || input.MinimumDueDate.Value.Year is >= 1900 and <= 9900, "最低还款截止日无效");
        Require(statement == null || statement >= 0, "账单金额不可负"); Require(minimum == null || minimum >= 0 && statement != null && minimum <= statement && input.MinimumDueDate != null, "最低还款需真实账单金额及截止日，不得超过账单");
        if (id == null) db.Add(row); else { db.Add(new DebtPlanHistory { UserId = user, PlanId = row.Id, SnapshotJson = JsonSerializer.Serialize(new { plan = DebtPlanView(row), schedule = JsonSerializer.Deserialize<DebtScheduleRow[]>(row.ScheduleJson, Json) }, Json), Reason = "用户修改前快照" }); row.Version++; }
        if (id == null || principal != row.Principal) row.PrincipalBaselineAt = DateTimeOffset.UtcNow;
        row.Kind = input.Kind; row.AccountId = account.Id; row.BusinessId = input.BusinessId; row.OriginalTransactionId = input.OriginalTransactionId; row.Name = input.Name.Trim(); row.Currency = account.Currency; row.Principal = principal; row.Periods = input.Periods; row.FirstDate = input.FirstDate; row.RepaymentMode = input.RepaymentMode; row.FeeMode = input.FeeMode; row.PeriodRate = input.FeeMode == "FixedPerPeriod" ? 0 : parameter; row.FixedFee = input.FeeMode == "FixedPerPeriod" ? parameter : 0; row.State = input.State; row.Note = input.Note; row.ScheduleJson = JsonSerializer.Serialize(schedule, Json); row.StatementAmount = statement; row.MinimumPayment = minimum; row.MinimumDueDate = input.MinimumDueDate; row.UpdatedAt = DateTimeOffset.UtcNow;
        return new { row.Id, version = row.Version.ToString() };
    }
    public async Task<object> DebtPlanDetail(string user, string id, IQueryCollection query) {
        var p = await DebtPlan(user, id); var rows = JsonSerializer.Deserialize<DebtScheduleRow[]>(p.ScheduleJson, Json)!;
        var allocations = await (from a in db.Set<DebtPaymentAllocation>().AsNoTracking() join t in db.Transactions on a.TransactionId equals t.Id where a.UserId == user && a.PlanId == id && a.State == "Active" && t.Status != "Deleted" && !db.Transactions.Any(r => r.UserId == user && r.OriginalTransactionId == t.Id && r.Status != "Deleted") select a).ToArrayAsync();
        var actualPrincipal = allocations.Where(x => x.Component == "Principal").Sum(x => x.Amount);
        decimal Paid(int sequence, string component) => allocations.Where(a => a.Sequence == sequence && a.Component == component).Sum(a => a.Amount);
        var reconciledPeriods = rows.Count(r => Paid(r.Sequence, "Principal") >= r.Principal && Paid(r.Sequence, "Fee") >= r.Fee);
        var (page, size) = Paging(query);
        var q = db.Transactions.AsNoTracking().Where(t => t.UserId == user && t.Status != "Deleted" && (p.Kind == "LoanRepayment" ? t.BusinessId == p.BusinessId && (t.Type == "LoanRepaymentPaid" || t.Type == "LoanRepaymentReceived") : (t.Type == "CreditCardPayment" || t.Type == "Transfer") && t.Entries.Any(e => e.Kind == "Account" && e.AccountId == p.AccountId && e.Amount > 0)));
        var facts = await q.OrderByDescending(x => x.OccurredAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.Type, x.OccurredAt }).ToArrayAsync();
        decimal current;
        if (p.Kind == "LoanRepayment") { var business = await BusinessEntity(user, p.BusinessId!); current = Math.Abs(await Balance(user, business.ContractAccountId)); }
        else current = Math.Max(0, -(await Balance(user, p.AccountId)));
        var needsReview = current < Math.Max(0, p.Principal - actualPrincipal);
        if (p.OriginalTransactionId != null) { var original = await Transaction(user, p.OriginalTransactionId); var refunded = await db.Transactions.Where(t => t.UserId == user && t.OriginalTransactionId == original.Id && t.Status != "Deleted").SumAsync(t => (decimal?)t.Amount) ?? 0; needsReview |= original.Status == "Deleted" || refunded > 0; }
        return new { plan = DebtPlanView(p), reconciledPeriods, unreconciledPeriods = rows.Length - reconciledPeriods, actualPrincipal = M(actualPrincipal), actualFee = M(allocations.Where(a => a.Component == "Fee").Sum(a => a.Amount)), remainingPlannedPrincipal = M(Math.Max(0, p.Principal - actualPrincipal)), needsReview, totalPlannedFee = M(rows.Sum(x => x.Fee)), plannedPrincipal = M(rows.Sum(x => x.Principal)), sourceCurrentOutstanding = M(current), schedule = rows.Select(x => new { x.Sequence, x.Date, openingPrincipal = M(x.OpeningPrincipal), principal = M(x.Principal), fee = M(x.Fee), total = M(x.Principal + x.Fee), remainingPrincipal = M(x.RemainingPrincipal), actualPrincipal = M(Paid(x.Sequence, "Principal")), actualFee = M(Paid(x.Sequence, "Fee")), difference = M(Paid(x.Sequence, "Principal") + Paid(x.Sequence, "Fee") - x.Principal - x.Fee), status = allocations.Where(a => a.Sequence == x.Sequence && a.Component == "Principal").Sum(a => a.Amount) >= x.Principal && allocations.Where(a => a.Sequence == x.Sequence && a.Component == "Fee").Sum(a => a.Amount) >= x.Fee ? "Reconciled" : "Planned", actual = allocations.Any(a => a.Sequence == x.Sequence) ? M(allocations.Where(a => a.Sequence == x.Sequence).Sum(a => a.Amount)) : null }), actualPayments = new { items = facts, total = await q.CountAsync(), page, pageSize = size }, explanation = "只读计划与实际记录分开。候选还款不可自动归属某一期；按用户核对关联汇总实际金额；actual为空表示未核对，不代表未还。计划本金不再次确认消费或负债；未来费用不入账。实际本金归还使用原信用卡/借贷API；已发生利息另用原费用/收入记账。当前账户全部欠款不等于此分期未偿本金。" };
    }
    public async Task<object> DebtPlanHistory(string user, string id, IQueryCollection query) {
        await DebtPlan(user, id); var (page, size) = Paging(query); var q = db.Set<DebtPlanHistory>().AsNoTracking().Where(x => x.UserId == user && x.PlanId == id);
        return new { items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.CreatedAt, x.Reason, snapshot = x.SnapshotJson }).ToArrayAsync(), total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> DebtPayoffPreview(string user, string id, PayoffInput input) {
        var p = await DebtPlan(user, id); var remaining = Money(input.RemainingPrincipal); var fee = Money(input.ConfirmedFee); Require(remaining >= 0 && remaining <= p.Principal && fee >= 0 && !string.IsNullOrWhiteSpace(input.Explanation) && input.Explanation.Length <= 2000, "请明确剩余本金、实际合同费用及确认说明");
        return new { p.Currency, remainingPrincipal = M(remaining), confirmedFee = M(fee), total = M(remaining + fee), unconfirmedFutureFees = M(JsonSerializer.Deserialize<DebtScheduleRow[]>(p.ScheduleJson, Json)!.Sum(x => x.Fee)), input.Explanation, warning = "用户输入的结清假设；没有自动确认剩余本金或手续费减免。仅预览，不冲销本金或未来费用，不记录实际付款。" };
    }
}







