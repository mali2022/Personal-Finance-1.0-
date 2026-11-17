using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class PayrollMath
{
    public static (decimal gross, decimal deduction, decimal net) Calculate(IEnumerable<PayrollComponent> components)
    {
        var rows = components.ToArray(); FinanceService.Require(rows.All(x => x.Kind is "Earning" or "Deduction" or "Adjustment" && (x.Kind == "Adjustment" || x.Amount >= 0)), "工资项目类型或金额无效");
        var gross = rows.Where(x => x.Kind == "Earning").Sum(x => x.Amount); var deduction = rows.Where(x => x.Kind == "Deduction").Sum(x => x.Amount);
        return (gross, deduction, gross - deduction + rows.Where(x => x.Kind == "Adjustment").Sum(x => x.Amount));
    }
}
public sealed partial class FinanceService
{
    private async Task<PayrollStatement> PayrollEntity(string user, string id) => await db.Set<PayrollStatement>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "工资条不存在");
    public async Task<object> PayrollDetail(string user, string id)
    {
        var p = await PayrollEntity(user, id); var components = await db.Set<PayrollComponent>().AsNoTracking().Where(x => x.UserId == user && x.PayrollId == id).ToArrayAsync();
        var (gross, deduction, net) = PayrollMath.Calculate(components);
        var payments = await (from link in db.Set<PayrollPayment>() join t in db.Transactions on link.TransactionId equals t.Id where link.UserId == user && link.PayrollId == id select t).AsNoTracking().ToArrayAsync();
        var actual = payments.Where(x => x.Status != "Deleted").Sum(x => x.Amount);
        return new { p.Id, p.Month, p.PayDate, p.Employer, p.Currency, p.State, p.Note, gross = M(gross), deduction = M(deduction), net = M(net), actual = M(actual), difference = M(actual - net),
            reconciliationState = p.State == "Cancelled" ? "Cancelled" : actual == 0 ? "Unpaid" : actual < net ? "Partial" : actual == net ? "Paid" : "NeedsReview",
            components = components.Select(x => new { x.Id, x.Name, x.Kind, amount = M(x.Amount) }),
            payments = payments.Select(x => new { x.Id, transactionId = x.Id, amount = M(x.Amount), x.OccurredAt, x.Status }), version = p.Version.ToString(), cashImpact = "0.00" };
    }
    public async Task<object> PayrollList(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.Set<PayrollStatement>().Where(x => x.UserId == user);
        var ids = await q.OrderByDescending(x => x.Month).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => x.Id).ToArrayAsync();
        var items = new List<object>(); foreach (var id in ids) items.Add(await PayrollDetail(user, id)); return new { items, total = await q.CountAsync(), page, pageSize = size };
    }
    public async Task<object> SavePayroll(string user, PayrollInput b, string? id, string? version)
    {
        Month(b.Month); Require(b.PayDate.Year is >= 1900 and <= 9998, "发薪日期无效"); AssetCurrency(b.Currency);
        Require(b.Employer.Trim().Length is > 0 and <= 200 && b.Note.Length <= 2000 && b.State is "Draft" or "Confirmed" or "Cancelled", "雇主、状态或备注无效");
        Require(b.Components is { Length: > 0 and <= 100 } && b.Components.All(x => x.Name.Trim().Length is > 0 and <= 100), "工资项目必须为1至100项");
        var parts = b.Components!.Select(x => new PayrollComponent { UserId = user, Name = x.Name.Trim(), Kind = x.Kind, Amount = Money(x.Amount) }).ToArray();
        var amounts = PayrollMath.Calculate(parts); Require(amounts.net >= 0, "实发工资不可为负");
        var p = id == null ? new PayrollStatement { UserId = user } : await PayrollEntity(user, id);
        if (id != null) { Version(p, version); Require(p.EmploymentId == null && p.State == "Draft", "请在薪酬与社保中心按版本更正工资条"); Require(p.Currency == b.Currency, "已有工资币种不可改变");
            Require(!await db.Set<SocialContributionRecord>().AnyAsync(x => x.UserId == user && x.PayrollId == id && x.PayrollComponentId != null), "工资扣款项目已有缴费引用，请先在缴费记录中解除扣款项目关联后更正工资构成");
            Require(b.State != "Cancelled" || !await db.Set<PayrollPayment>().AnyAsync(x => x.UserId == user && x.PayrollId == id), "有关联到账的工资条不能取消");
            db.RemoveRange(await db.Set<PayrollComponent>().Where(x => x.UserId == user && x.PayrollId == id).ToArrayAsync()); p.Version++; }
        p.Month = b.Month; p.PayDate = b.PayDate; p.Employer = b.Employer.Trim(); p.Currency = b.Currency; p.State = b.State; p.Note = b.Note; p.UpdatedAt = DateTimeOffset.UtcNow;
        if (id == null) db.Add(p); foreach (var part in parts) { part.PayrollId = p.Id; db.Add(part); }
        return new { p.Id, version = p.Version.ToString(), gross = M(amounts.gross), deduction = M(amounts.deduction), net = M(amounts.net), cashImpact = "0.00" };
    }
    public async Task<object> ReconcilePayroll(string user, string id, PayrollReconcileInput b, string? version)
    {
        var p = await PayrollEntity(user, id); Version(p, version); Require(p.State is "Confirmed" or "Paid" or "Reconciled", "请先确认工资条再关联到账");
        var t = await Transaction(user, b.TransactionId); Require(t.Type == "Income" && t.Status == "Confirmed" && t.Currency == p.Currency && t.BusinessId == null, "请选择同币种已确认的实际工资收入");
        Require(!await db.Set<PayrollPayment>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id) && !await db.Set<InvestmentTrade>().AnyAsync(x => x.UserId == user && x.TransactionId == t.Id) &&
            !await db.Set<CashbackReceivable>().AnyAsync(x => x.UserId == user && x.SettlementTransactionId == t.Id), "收入已关联工资、投资或返现");
        db.Add(new PayrollPayment { UserId = user, PayrollId = p.Id, TransactionId = t.Id }); p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        return new { p.Id, transactionId = t.Id, cashImpact = "0.00", rule = "仅关联已有实际收入，不更改金额或再次入账；差额需人工核对。" };
    }
    public async Task<object> UnlinkPayroll(string user, string id, PayrollReconcileInput b, string? version)
    {
        var p = await PayrollEntity(user, id); Version(p, version);
        var link = await db.Set<PayrollPayment>().SingleOrDefaultAsync(x => x.UserId == user && x.PayrollId == id && x.TransactionId == b.TransactionId) ?? throw new ApiException(404, "到账关联不存在");
        await SavePayrollRevision(user,p,"Unlink","解除到账关联 / Unlink receipt");
        db.Remove(link); if (p.State == "Reconciled") p.State = "Paid"; p.Version++; p.UpdatedAt = DateTimeOffset.UtcNow;
        return new { p.Id, version = p.Version.ToString(), cashImpact = "0.00", rule = "仅解除工资条关联，原实际收入保持不变。" };
    }
    public async Task<object> Contributions(string user, IQueryCollection query, bool housing)
    {
        var (page, size) = Paging(query); var q = db.Set<SocialContributionRecord>().AsNoTracking().Where(x => x.UserId == user && (housing ? x.Kind == "HousingFund" : x.Kind != "HousingFund"));
        var rows = await q.OrderByDescending(x => x.Month).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * size).Take(size).ToArrayAsync();
        return new { items = rows.Select(x => new { x.Id, x.Month, x.PaidDate, x.Region, x.Kind, x.Currency, basis = M(x.Basis), personalAmount = M(x.PersonalAmount), employerAmount = M(x.EmployerAmount),
              x.State, x.Supplementary, x.PayrollId, x.PayrollComponentId, x.LoanBusinessId, x.AccountId, reportedBalance = x.ReportedBalance == null ? null : M(x.ReportedBalance.Value), x.BalanceSource, x.Note, version = x.Version.ToString() }), total = await q.CountAsync(), page, pageSize = size,
            rule = "缴费明细不生成现金交易；单位缴费不认定为本人现金。公积金净资产仅采用原账户，不另加余额记录。" };
    }
    public async Task<object> SaveContribution(string user, ContributionInput b, bool housing, string? id, string? version)
    {
        Month(b.Month); AssetDate(b.PaidDate); AssetCurrency(b.Currency);
        Require(b.Region.Trim().Length is > 0 and <= 200 && b.Note.Length <= 2000 && b.State is "Pending" or "Confirmed" or "Cancelled", "地区、状态或备注无效");
        Require(housing ? b.Kind == "HousingFund" : b.Kind is "Pension" or "Medical" or "Unemployment" or "WorkInjury" or "Maternity" or "Other", "缴费项目无效");
        var basis = Money(b.Basis); var personal = Money(b.PersonalAmount); var employer = Money(b.EmployerAmount); Require(basis >= 0 && personal >= 0 && employer >= 0, "缴费金额不可为负");
        if (b.PayrollId != null) { var p = await PayrollEntity(user, b.PayrollId); Require(p.Currency == b.Currency && p.State != "Cancelled", "关联工资币种或状态无效"); }
        if (b.PayrollComponentId != null)
        {
            Require(b.PayrollId != null, "扣款项目必须指定所属工资条");
            var component = await db.Set<PayrollComponent>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == b.PayrollComponentId && x.PayrollId == b.PayrollId && x.Kind == "Deduction") ?? throw new ApiException(404, "同一工资条的扣款项目不存在");
            var linked = await db.Set<SocialContributionRecord>().Where(x => x.UserId == user && x.PayrollComponentId == component.Id && x.Id != id && x.State != "Cancelled").SumAsync(x => (decimal?)x.PersonalAmount) ?? 0;
            Require(b.State == "Cancelled" || linked + personal <= component.Amount, "关联个人缴费合计超过工资扣款金额；单位缴费不占用个人扣款额度");
        }
        if (b.LoanBusinessId != null)
        {
            var loan = await BusinessEntity(user, b.LoanBusinessId);
            Require(housing && loan.Kind == "Borrowed" && loan.Currency == b.Currency, "公积金贷款信息须关联同币种已有借入业务，不重复创建贷款本金");
        }
        Require(housing || b.AccountId == null && b.ReportedBalance == null && b.BalanceSource == "NoBalance", "社保缴费不登记个人可支配资产余额");
        if (b.AccountId != null) { var a = await Account(user, b.AccountId, false); Require(a.Currency == b.Currency && a.Type == "Other", "公积金需关联同币种其他资产账户"); }
        decimal? balance = b.ReportedBalance == null ? null : Money(b.ReportedBalance);
        Require(balance == null ? b.BalanceSource == "NoBalance" : balance >= 0 && b.BalanceSource is "ManualStatement" or "ProviderStatement", "余额需明确可靠来源；缴存明细不自动推算当前余额");
        var r = id == null ? new SocialContributionRecord { UserId = user } : await db.Set<SocialContributionRecord>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id && (housing ? x.Kind == "HousingFund" : x.Kind != "HousingFund")) ?? throw new ApiException(404, "缴费记录不存在");
        if (id != null) { Version(r, version); r.Version++; }
        r.Month = b.Month; r.PaidDate = b.PaidDate; r.Region = b.Region.Trim(); r.Kind = b.Kind; r.Currency = b.Currency; r.Basis = basis; r.PersonalAmount = personal; r.EmployerAmount = employer;
        r.State = b.State; r.Supplementary = b.Supplementary; r.PayrollId = b.PayrollId; r.PayrollComponentId = b.PayrollComponentId; r.LoanBusinessId = b.LoanBusinessId; r.AccountId = b.AccountId; r.ReportedBalance = balance; r.BalanceSource = b.BalanceSource; r.Note = b.Note; r.UpdatedAt = DateTimeOffset.UtcNow;
        if (id == null) db.Add(r); return new { r.Id, version = r.Version.ToString(), cashImpact = "0.00" };
    }
}
