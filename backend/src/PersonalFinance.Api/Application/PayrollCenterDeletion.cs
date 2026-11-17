using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> PayrollPlanDelete(string user, string id, string? version)
    {
        var plan = await PayOwned<CompensationPlan>(user, id);
        Version(plan, version);
        Require(!await db.Set<PayrollStatement>().AnyAsync(x => x.UserId == user && x.PlanId == id), "该薪酬方案已被工资条引用，请先更正工资条解除方案引用或删除相关工资条");
        db.Remove(plan);
        return new { id, deleted = true, cashImpact = "0.00" };
    }

    public async Task<object> PayrollCenterDelete(string user, string id, string? version)
    {
        var slip = await PayrollEntity(user, id);
        Version(slip, version);
        Require(!await db.Set<PayrollPayment>().AnyAsync(x => x.UserId == user && x.PayrollId == id), "请先在工资条详情解除全部到账关联后删除，原收入交易会保留");
        var components = await db.Set<PayrollComponent>().Where(x => x.UserId == user && x.PayrollId == id).ToArrayAsync();
        var componentIds = components.Select(x => x.Id).ToArray();
        Require(!await db.Set<SocialContributionRecord>().AnyAsync(x => x.UserId == user && x.SourceEvidence != PayrollContributionSource && x.SourceEvidence != DeletedPayrollContributionSource && (x.PayrollId == id || (x.PayrollComponentId != null && componentIds.Contains(x.PayrollComponentId)))), "请先在缴费记录中解除工资条及扣款项目关联后删除（包括已取消的缴费记录）");
        db.RemoveRange(await db.Set<SocialContributionRecord>().Where(x => x.UserId == user && x.PayrollId == id && (x.SourceEvidence == PayrollContributionSource || x.SourceEvidence == DeletedPayrollContributionSource)).ToArrayAsync());
        db.RemoveRange(await db.Documents.Where(x => x.UserId == user && x.PayrollId == id).ToArrayAsync());
        db.RemoveRange(await db.Set<PayrollRevision>().Where(x => x.UserId == user && x.PayrollId == id).ToArrayAsync());
        db.RemoveRange(components);
        db.Remove(slip);
        return new { id, deleted = true, cashImpact = "0.00" };
    }
}
