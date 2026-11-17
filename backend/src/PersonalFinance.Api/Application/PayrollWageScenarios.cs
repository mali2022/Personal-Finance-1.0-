using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> PayrollTaxContext(string user,string employmentId,string month) {
        var employment=await PayOwned<PayrollEmployment>(user,employmentId);Month(month);var period=DateOnly.Parse(month+"-01",CultureInfo.InvariantCulture);var first=new DateOnly(period.Year,1,1);var end=period.AddMonths(1);
        var slips=await db.Set<PayrollStatement>().AsNoTracking().Where(x=>x.UserId==user && x.EmploymentId==employmentId && x.Currency=="CNY" && x.State!="Draft" && x.State!="PendingReview" && x.State!="Voided" && x.State!="Cancelled" && x.PayDate>=first && x.PayDate<end).ToArrayAsync();
        var ids=slips.Select(x=>x.Id).ToArray();var parts=await db.Set<PayrollComponent>().AsNoTracking().Where(x=>x.UserId==user && ids.Contains(x.PayrollId)).ToArrayAsync();var prior=slips.Where(x=>x.PayDate<period).Select(x=>x.Id).ToHashSet();var current=slips.Where(x=>x.PayDate>=period).Select(x=>x.Id).ToHashSet();
        var unspecified=parts.Any(x=>x.Kind=="Earning" && x.TaxTreatment is not ("Taxable" or "Exempt"));Require(!unspecified,"有工资项目尚未核对税务属性，请先更正工资条");
        return new{employmentId,month,taxableIncome=M(parts.Where(x=>x.Kind=="Earning").Sum(x=>x.Amount)),exemptIncome=M(parts.Where(x=>x.Kind=="Earning" && x.TaxTreatment=="Exempt").Sum(x=>x.Amount)),specialDeductions=M(parts.Where(x=>x.Kind=="Deduction" && x.Category is "Pension" or "Medical" or "Unemployment" or "HousingFund").Sum(x=>x.Amount)),alreadyWithheld=M(parts.Where(x=>prior.Contains(x.PayrollId) && x.Kind=="Deduction" && x.Category=="Tax").Sum(x=>x.Amount)),actualTax=M(parts.Where(x=>current.Contains(x.PayrollId) && x.Kind=="Deduction" && x.Category=="Tax").Sum(x=>x.Amount)),expenseMonths=period.Month-(employment.StartDate.Year==period.Year?employment.StartDate.Month:1)+1,count=slips.Length,note="按实际发薪年月读取本单位已确认人民币工资；专项扣除仍须核对合法性，非工资综合所得不包含在内。"};
    }
    public async Task<object> PayrollWageSimulate(string user,PayrollWageScenario b) {
        var slip=await PayrollEntity(user,b.SlipId);Require(slip.EmploymentId!=null && slip.Currency=="CNY" && slip.State is "Confirmed" or "Paid" or "Reconciled","调薪模拟须选择已确认的人民币、已关联工作经历工资条");
        var month=slip.PayDate.ToString("yyyy-MM");var period=DateOnly.Parse(month+"-01",CultureInfo.InvariantCulture);var end=period.AddMonths(1);
        Require(await db.Set<PayrollStatement>().CountAsync(x=>x.UserId==user && x.EmploymentId==slip.EmploymentId && x.Currency=="CNY" && x.PayDate>=period && x.PayDate<end && x.State!="Draft" && x.State!="PendingReview" && x.State!="Voided" && x.State!="Cancelled")==1,"同一发薪月多条工资请使用累计税额情景手工核对，避免重复估算");
        var context=JsonSerializer.SerializeToElement(await PayrollTaxContext(user,slip.EmploymentId!,month),Json);var policy=await PayOwned<SocialInsurancePolicy>(user,b.PolicyId);Require(policy.Verified && policy.EffectiveFrom<=slip.PayDate && policy.EffectiveTo>=slip.PayDate,"缴费政策须已核验且适用于模拟发薪日期");
        var basis=Nonnegative(b.ContributionBasis);var delta=Money(b.GrossChange);var rates=JsonSerializer.Deserialize<InsuranceRate[]>(policy.RatesJson,Json)!;decimal personal=0,employer=0;
        foreach(var r in rates.Where(x=>x.Applicable && x.CollectedWith=="")){var bounded=Math.Clamp(basis,Nonnegative(r.Lower),Nonnegative(r.Upper));personal+=PayrollTaxMath.Round(bounded*PayrollTaxMath.Rate(r.PersonalRate));employer+=PayrollTaxMath.Round(bounded*PayrollTaxMath.Rate(r.EmployerRate));}
        var rows=await db.Set<PayrollComponent>().AsNoTracking().Where(x=>x.UserId==user && x.PayrollId==slip.Id).ToArrayAsync();var oldPersonal=rows.Where(x=>x.Kind=="Deduction" && x.Category is "Pension" or "Medical" or "Unemployment" or "HousingFund").Sum(x=>x.Amount);var gross=PayrollMath.Calculate(rows).gross+delta;Require(gross>=0,"模拟应发金额不得为负");
        var cumulative=Money(context.GetProperty("taxableIncome").GetString())+delta;var special=Money(context.GetProperty("specialDeductions").GetString())-oldPersonal+personal;Require(cumulative>=0 && special>=0,"累计情景金额无效");
        var simulation=new TaxSimulation(slip.EmploymentId!,b.RuleId,month,context.GetProperty("expenseMonths").GetInt32(),M(cumulative),context.GetProperty("exemptIncome").GetString()!,M(special),"0","0",context.GetProperty("alreadyWithheld").GetString()!,context.GetProperty("actualTax").GetString()!);
        var tax=JsonSerializer.SerializeToElement(await PayrollSimulateTax(user,simulation),Json);var taxResult=tax.GetProperty("result");var withholding=Money(taxResult.GetProperty("currentWithholding").GetString());var other=rows.Where(x=>x.Kind=="Deduction" && x.Category is not ("Pension" or "Medical" or "Unemployment" or "HousingFund" or "Tax")).Sum(x=>x.Amount);
        var result=new{assumptions=b,slipId=slip.Id,policyVersion=policy.PolicyVersion,policyRegion=policy.Region,simulatedGross=M(gross),simulatedPersonalContribution=M(personal),simulatedEmployerContribution=M(employer),simulatedTax=M(withholding),simulatedNet=M(gross-personal-other-withholding),actualNet=M(PayrollMath.Calculate(rows).net),difference=M(gross-personal-other-withholding-PayrollMath.Calculate(rows).net),taxCalculationId=tax.GetProperty("id"),note="假设工资增减全额计税且参与缴费；使用输入缴费基数，不将预计基数当作实际缴费依据。其他依法扣除、减免税额按零，个人与单位缴费分别显示。只适用于单单位单个发薪月一条工资的比较，不改变正式工资或银行交易。"};
        var calculation=db.Set<PayrollTaxCalculation>().Local.Single(x=>x.Id==tax.GetProperty("id").GetString());calculation.ResultsJson=JsonSerializer.Serialize(new{tax=taxResult,wageScenario=result,ruleVersion=taxResult.GetProperty("ruleVersion"),currentWithholding=taxResult.GetProperty("currentWithholding"),scenario="WageChange"},Json);
        return result;
    }
}
