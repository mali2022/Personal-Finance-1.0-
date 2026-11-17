using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public static class PayrollTaxMath
{
    public static decimal Round(decimal v) => Math.Round(v,2,MidpointRounding.AwayFromZero);
    public static decimal Rate(string s) { if (!decimal.TryParse(s,NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var v) || v < 0 || v > 1) throw new ApiException(422,"比例必须为0至1的小数"); return v; }
    public static decimal Tax(decimal basis, TaxBracket[] brackets) {
        FinanceService.Require(brackets is {Length: > 0 and <= 20},"税率表无效");
        var band=brackets.FirstOrDefault(x=>FinanceService.Money(x.Upper)>=basis) ?? throw new ApiException(422,"税率表未覆盖模拟金额");
        return Round(Math.Max(0,basis*Rate(band.Rate)-FinanceService.Money(band.Quick)));
    }
    public static void Validate(TaxRules r) {
        if(r is null || r.AnnualBrackets is null || r.BonusBrackets is null || r.Deductions is null)throw new ApiException(422,"税率表无效");
        FinanceService.Require(r.Scope=="CNResidentSalary" && FinanceService.Money(r.MonthlyExpense)>=0,"仅支持中国大陆居民工资薪金规则");
        foreach(var bands in new[]{r.AnnualBrackets,r.BonusBrackets}) {
            FinanceService.Require(bands.Length is > 0 and <= 20,"税率表无效"); decimal last=0; decimal previousRate=0; decimal previousQuick=0;
            foreach(var band in bands) {var upper=FinanceService.Money(band.Upper);var rate=Rate(band.Rate);var quick=FinanceService.Money(band.Quick);
                FinanceService.Require(upper>last && rate>=previousRate && quick>=0,"税率级距、比例或速算扣除数无效");
                if(last>0) FinanceService.Require(Math.Abs(last*previousRate-previousQuick-(last*rate-quick))<=0.01m,"税率表在级距边界不连续");
                last=upper;previousRate=rate;previousQuick=quick;
            }
        }
        FinanceService.Require(r.Deductions.Length<=30 && r.Deductions.Select(x=>x.Kind).Distinct().Count()==r.Deductions.Length,"扣除规则重复或过多");
        foreach(var d in r.Deductions) FinanceService.Require(FinanceService.Money(d.MonthlyLimit)>=0 && d.Conditions.Length>0,"扣除限额或资格条件缺失");
    }
}
public sealed partial class FinanceService
{
    private async Task<T> PayOwned<T>(string user,string id) where T:Owned => await db.Set<T>().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id) ?? throw new ApiException(404,"薪酬记录不存在");
    private static string Text(string? s,int max,bool required=false) {s=s?.Trim()??"";Require(s.Length<=max && (!required || s.Length>0),"字段长度或必填内容无效");return s;}
    private static void PayrollDate(DateOnly d) => Require(d.Year is >=1900 and <=9998,"日期须为1900至9998年");
    private static decimal Nonnegative(string s) {var n=Money(s);Require(n>=0,"金额不得为负");return n;}
    public async Task<object> PayrollEmployers(string user) => (await db.Set<PayrollEmployer>().AsNoTracking().Where(x=>x.UserId==user).OrderBy(x=>x.Name).ToArrayAsync()).Select(x=>new{x.Id,x.Name,x.Type,x.City,x.Status,x.Note,version=x.Version.ToString()});
    public async Task<object> PayrollEmployerSave(string user,EmployerSave b,string? id,string? version) {
        Require(b.Status is "Active" or "Archived","状态无效"); var x=id==null?new PayrollEmployer{UserId=user}:await PayOwned<PayrollEmployer>(user,id);
        if(id!=null){Version(x,version);x.Version++;}x.Name=Text(b.Name,200,true);x.Type=Text(b.Type,40,true);x.City=Text(b.City,200);x.Note=Text(b.Note,2000);x.Status=b.Status;x.UpdatedAt=DateTimeOffset.UtcNow;if(id==null)db.Add(x);return new{x.Id,version=x.Version.ToString()};
    }
    public async Task<object> PayrollEmployments(string user) => await (from x in db.Set<PayrollEmployment>().AsNoTracking() join e in db.Set<PayrollEmployer>() on x.EmployerId equals e.Id where x.UserId==user orderby x.StartDate descending select new{x.Id,x.EmployerId,employerName=e.Name,x.Workplace,x.StartDate,x.EndDate,x.Position,x.Department,x.EmployeeNumber,x.PayCycle,x.PayDay,x.AccountId,x.InsuranceCity,x.HousingCity,x.Status,version=x.Version.ToString()}).ToArrayAsync();
    public async Task<object> PayrollEmploymentSave(string user,EmploymentSave b,string? id,string? version) {
        await PayOwned<PayrollEmployer>(user,b.EmployerId);PayrollDate(b.StartDate);Require(b.EndDate==null || b.EndDate>=b.StartDate,"离职日期不可早于入职日期");
        Require(b.PayDay is >=1 and <=31 && b.PayCycle is "Monthly" or "Weekly" or "Biweekly" or "AdHoc" && b.Status is "Active" or "Left" or "Paused","发薪周期或状态无效");
        if(b.AccountId!=null)await Account(user,b.AccountId,false);
        var x=id==null?new PayrollEmployment{UserId=user}:await PayOwned<PayrollEmployment>(user,id);if(id!=null){Version(x,version);x.Version++;}
        x.EmployerId=b.EmployerId;x.Workplace=Text(b.Workplace,200);x.StartDate=b.StartDate;x.EndDate=b.EndDate;x.Position=Text(b.Position,200);x.Department=Text(b.Department,200);x.EmployeeNumber=Text(b.EmployeeNumber,100);x.PayCycle=b.PayCycle;x.PayDay=b.PayDay;x.AccountId=b.AccountId;x.InsuranceCity=Text(b.InsuranceCity,200);x.HousingCity=Text(b.HousingCity,200);x.Status=b.Status;x.UpdatedAt=DateTimeOffset.UtcNow;if(id==null)db.Add(x);return new{x.Id,version=x.Version.ToString()};
    }
    private static PayrollComponent[] PayItems(string user,PayItem[] rows) {
        Require(rows is {Length: >0 and <=100},"工资项目须为1至100项");Require(rows.Select(x=>x.Code).Distinct().Count()==rows.Length,"项目编码不可重复");
        return rows.Select((i,index)=>{
            Require(i.Kind is "Earning" or "Deduction" or "Adjustment" && i.TaxTreatment is "Taxable" or "Exempt" or "NotApplicable" or "Unspecified" && i.Status is "Active" or "Inactive","项目类型、计税属性或状态无效");
            Require(i.Category is "Base" or "Performance" or "Commission" or "AnnualBonus" or "QuarterlyBonus" or "Overtime" or "BackPay" or "Allowance" or "Other" or "Pension" or "Medical" or "Unemployment" or "HousingFund" or "Tax" or "OtherDeduction","工资项目分类无效");
            var qty=Nonnegative(i.Quantity);var rate=Nonnegative(i.UnitRate);var amount=Money(i.Amount);Require(i.Kind=="Adjustment" || amount>=0,"工资项目金额无效");
            return new PayrollComponent{UserId=user,Name=Text(i.Name,100,true),Code=Text(i.Code,80,true),Kind=i.Kind,Category=i.Category,TaxTreatment=i.TaxTreatment,InsuranceBasis=i.InsuranceBasis,HousingBasis=i.HousingBasis,Quantity=qty,UnitRate=rate,Amount=i.Status=="Inactive"?0:amount,SortOrder=i.SortOrder==0?index:i.SortOrder,Status=i.Status};
        }).ToArray();
    }
    public async Task<object> PayrollPlans(string user) => (await db.Set<CompensationPlan>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.EffectiveFrom).ToArrayAsync()).Select(x=>new{x.Id,x.EmploymentId,x.Name,x.SeriesId,x.Revision,x.PayBasis,x.Currency,x.EffectiveFrom,x.EffectiveTo,items=JsonSerializer.Deserialize<PayItem[]>(x.ItemsJson,Json),x.Status,version=x.Version.ToString()});
    public async Task<object> PayrollPlanSave(string user,PlanSave b) {
        await PayOwned<PayrollEmployment>(user,b.EmploymentId);AssetCurrency(b.Currency);PayrollDate(b.EffectiveFrom);Require(b.EffectiveTo==null || b.EffectiveTo>=b.EffectiveFrom,"方案生效区间无效");Require(b.PayBasis is "Monthly" or "Hourly" or "Daily" or "Piecework","工资基准无效");PayItems(user,b.Items);
        var x=new CompensationPlan{UserId=user,EmploymentId=b.EmploymentId,Name=Text(b.Name,200,true),Currency=b.Currency,PayBasis=b.PayBasis,EffectiveFrom=b.EffectiveFrom,EffectiveTo=b.EffectiveTo,ItemsJson=JsonSerializer.Serialize(b.Items,Json)};
        if(b.PreviousId!=null){var old=await PayOwned<CompensationPlan>(user,b.PreviousId);Require(old.EmploymentId==b.EmploymentId,"不能跨工作经历修订方案");x.SeriesId=old.SeriesId;x.Revision=await db.Set<CompensationPlan>().Where(p=>p.UserId==user && p.SeriesId==old.SeriesId).MaxAsync(p=>p.Revision)+1;}
        db.Add(x);return new{x.Id,x.SeriesId,x.Revision,version="1"};
    }
    public async Task<object> PayrollCenterDetail(string user,string id) {
        var p=await PayrollEntity(user,id);var rows=await db.Set<PayrollComponent>().AsNoTracking().Where(x=>x.UserId==user && x.PayrollId==id).OrderBy(x=>x.SortOrder).ToArrayAsync();var totals=PayrollMath.Calculate(rows);
        var payments=await (from link in db.Set<PayrollPayment>() join t in db.Transactions on link.TransactionId equals t.Id where link.UserId==user && link.PayrollId==id select new{link.Id,transactionId=t.Id,amount=M(t.Amount),t.Currency,t.AccountId,t.OccurredAt,t.Status}).ToArrayAsync();
        var actual=payments.Where(x=>x.Status=="Confirmed").Sum(x=>Money(x.amount));
        var attachment=await db.Documents.Where(x=>x.UserId==user && x.PayrollId==id).Select(x=>new{x.Id,x.Name,x.ContentType}).ToArrayAsync();
        return new{p.Id,p.Month,p.PayDate,p.Employer,p.EmploymentId,p.PlanId,p.AccountId,p.Currency,p.State,p.Note,p.CreatedAt,p.UpdatedAt,version=p.Version.ToString(),gross=M(totals.gross),deduction=M(totals.deduction),net=M(totals.net),actual=M(actual),difference=M(actual-totals.net),
            taxable=M(rows.Where(x=>x.Kind=="Earning" && x.TaxTreatment=="Taxable").Sum(x=>x.Amount)),taxUnspecified=rows.Any(x=>x.Kind=="Earning" && x.TaxTreatment=="Unspecified"),
            personalSocial=M(rows.Where(x=>x.Kind=="Deduction" && x.Category is "Pension" or "Medical" or "Unemployment").Sum(x=>x.Amount)),personalHousing=M(rows.Where(x=>x.Kind=="Deduction" && x.Category=="HousingFund").Sum(x=>x.Amount)),tax=M(rows.Where(x=>x.Kind=="Deduction" && x.Category=="Tax").Sum(x=>x.Amount)),otherDeductions=M(rows.Where(x=>x.Kind=="Deduction" && x.Category is not ("Pension" or "Medical" or "Unemployment" or "HousingFund" or "Tax")).Sum(x=>x.Amount)),
            reconciliationState=actual==0?"Unpaid":actual==totals.net?"Matched":actual<totals.net?"Partial":"AmountMismatch",
            items=rows.Select(x=>new{x.Id,x.Code,x.Name,x.Kind,x.Category,x.TaxTreatment,x.InsuranceBasis,x.HousingBasis,quantity=M(x.Quantity),unitRate=M(x.UnitRate),amount=M(x.Amount),x.SortOrder,x.Status}),payments,attachments=attachment,cashImpact="0.00"};
    }
    public async Task<object> PayrollCenterSlips(string user,IQueryCollection query) {
        var(page,size)=Paging(query);var q=db.Set<PayrollStatement>().AsNoTracking().Where(x=>x.UserId==user);var month=query["month"].ToString();var employment=query["employmentId"].ToString();var state=query["state"].ToString();var currency=query["currency"].ToString();
        if(month!=""){Month(month);q=q.Where(x=>x.Month==month);}if(employment!="")q=q.Where(x=>x.EmploymentId==employment);if(state!="")q=q.Where(x=>x.State==state);if(currency!="")q=q.Where(x=>x.Currency==currency);
        var total=await q.CountAsync();var ids=await q.OrderByDescending(x=>x.Month).ThenByDescending(x=>x.PayDate).ThenBy(x=>x.Id).Skip((page-1)*size).Take(size).Select(x=>x.Id).ToArrayAsync();var items=new List<object>();foreach(var id in ids)items.Add(await PayrollCenterDetail(user,id));return new{items,total,page,pageSize=size};
    }
    private async Task SavePayrollRevision(string user,PayrollStatement p,string action,string reason) {
        db.Add(new PayrollRevision{UserId=user,PayrollId=p.Id,PayrollVersion=p.Version,Action=action,Reason=reason,SnapshotJson=JsonSerializer.Serialize(await PayrollCenterDetail(user,p.Id),Json)});
    }
    public async Task<object> PayrollCenterSave(string user,SlipSave b,string? id,string? version) {
        Month(b.Month);PayrollDate(b.PayDate);AssetCurrency(b.Currency);Text(b.Note,2000);var rows=PayItems(user,b.Items);var totals=PayrollMath.Calculate(rows);Require(totals.net>=0,"实发工资不可为负");
        var employer=Text(b.Employer,200,true);
        if(b.EmploymentId!=null){var e=await PayOwned<PayrollEmployment>(user,b.EmploymentId);var company=await PayOwned<PayrollEmployer>(user,e.EmployerId);employer=company.Name;var first=DateOnly.Parse(b.Month+"-01",CultureInfo.InvariantCulture);Require(e.StartDate<=first.AddMonths(1).AddDays(-1) && (e.EndDate==null || e.EndDate>=first),"工资归属月不在任职区间");}
        if(b.PlanId!=null){var plan=await PayOwned<CompensationPlan>(user,b.PlanId);var first=DateOnly.Parse(b.Month+"-01",CultureInfo.InvariantCulture);Require(plan.EmploymentId==b.EmploymentId && plan.Currency==b.Currency && plan.EffectiveFrom<=first.AddMonths(1).AddDays(-1) && (plan.EffectiveTo==null || plan.EffectiveTo>=first),"薪酬方案不适用于本工资条");}
        if(b.AccountId!=null){var a=await Account(user,b.AccountId,false);Require(a.Currency==b.Currency,"到账账户币种不一致");}
        var p=id==null?new PayrollStatement{UserId=user}:await PayrollEntity(user,id);
        if(id!=null){Version(p,version);Require(p.State is not ("Cancelled" or "Voided"),"作废工资条不能修改");
            if(p.State is not ("Draft" or "PendingReview"))Require(Text(b.CorrectionReason,1000).Length>0,"已确认工资条更正必须填写原因");
            Require(p.Currency==b.Currency,"已有工资币种不可改变");Require(!await db.Set<SocialContributionRecord>().AnyAsync(x=>x.UserId==user && x.PayrollId==id && x.PayrollComponentId!=null),"请先解除缴费对工资项目的引用");
            await SavePayrollRevision(user,p,"Correct",b.CorrectionReason);p.Version++;db.RemoveRange(await db.Set<PayrollComponent>().Where(x=>x.UserId==user && x.PayrollId==id).ToArrayAsync());
        }
        p.Month=b.Month;p.PayDate=b.PayDate;p.Employer=employer;p.EmploymentId=b.EmploymentId;p.PlanId=b.PlanId;p.AccountId=b.AccountId;p.Currency=b.Currency;p.State="Draft";p.Note=b.Note;p.CorrectionReason=b.CorrectionReason;p.UpdatedAt=DateTimeOffset.UtcNow;
        if(id==null)db.Add(p);foreach(var row in rows){row.PayrollId=p.Id;db.Add(row);}
        await SyncPayrollContributions(user,p,rows);
        return new{p.Id,version=p.Version.ToString(),gross=M(totals.gross),net=M(totals.net),cashImpact="0.00"};
    }
    public async Task<object> PayrollCenterAction(string user,string id,SlipAction b,string? version) {
        var p=await PayrollEntity(user,id);Version(p,version);Require(p.State is not ("Cancelled" or "Voided"),"工资条已作废");
        var next=b.Action switch{"review"=>"PendingReview","confirm"=>"Confirmed","paid"=>"Paid","void"=>"Voided",_=>throw new ApiException(422,"工资条动作无效")};
        Require(b.Action=="review"?p.State=="Draft":b.Action=="confirm"?p.State is "Draft" or "PendingReview":b.Action=="paid"?p.State=="Confirmed":true,"工资条状态不允许此操作");
        if(b.Action=="void"){Require(Text(b.Reason,1000,true).Length>0,"作废须填写原因");Require(!await db.Set<PayrollPayment>().AnyAsync(x=>x.UserId==user && x.PayrollId==id),"请先解除到账关联后作废");Require(!await db.Set<SocialContributionRecord>().AnyAsync(x=>x.UserId==user && x.PayrollId==id && x.State!="Cancelled" && x.SourceEvidence!=PayrollContributionSource),"请先更正关联缴费");}
        await SavePayrollRevision(user,p,b.Action,b.Reason);p.State=next;p.Version++;p.UpdatedAt=DateTimeOffset.UtcNow;if(next=="Voided")await SyncPayrollContributions(user,p,[]);return new{p.Id,p.State,version=p.Version.ToString()};
    }
    public async Task<object> PayrollCenterGenerate(string user,SlipGenerate b) {
        var p=await PayOwned<CompensationPlan>(user,b.PlanId);var e=await PayOwned<PayrollEmployment>(user,p.EmploymentId);var company=await PayOwned<PayrollEmployer>(user,e.EmployerId);
        return await PayrollCenterSave(user,new(b.Month,b.PayDate,company.Name,p.Currency,JsonSerializer.Deserialize<PayItem[]>(p.ItemsJson,Json)!.Select(i=>Money(i.UnitRate)>0?i with { Amount=M(PayrollTaxMath.Round(Nonnegative(i.Quantity)*Nonnegative(i.UnitRate))) }:i).ToArray(),e.Id,p.Id,e.AccountId),null,null);
    }
    public async Task<object> PayrollCenterCopy(string user,string id,string month,DateOnly payDate) {
        var old=await PayrollEntity(user,id);var rows=await db.Set<PayrollComponent>().Where(x=>x.UserId==user && x.PayrollId==id).OrderBy(x=>x.SortOrder).ToArrayAsync();
        return await PayrollCenterSave(user,new(month,payDate,old.Employer,old.Currency,rows.Select(x=>new PayItem(x.Name,x.Code=="Legacy"?x.Id:x.Code,x.Kind,x.Category,M(x.Amount),x.TaxTreatment,x.InsuranceBasis,x.HousingBasis,M(x.Quantity),M(x.UnitRate),x.SortOrder,x.Status)).ToArray(),old.EmploymentId,null,old.AccountId,"Copied / 复制"),null,null);
    }
    public async Task<object> PayrollCenterHistory(string user,string id) {await PayrollEntity(user,id);return (await db.Set<PayrollRevision>().AsNoTracking().Where(x=>x.UserId==user && x.PayrollId==id).OrderByDescending(x=>x.PayrollVersion).ToArrayAsync()).Select(x=>new{x.Id,x.PayrollVersion,x.Action,x.Reason,x.CreatedAt,snapshot=JsonSerializer.Deserialize<JsonElement>(x.SnapshotJson,Json)});}
}
