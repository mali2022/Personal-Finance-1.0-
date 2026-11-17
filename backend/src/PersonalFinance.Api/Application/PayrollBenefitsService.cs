using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> PayrollPolicies(string user) => (await db.Set<SocialInsurancePolicy>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.EffectiveFrom).ToArrayAsync()).Select(x=>new{x.Id,x.Name,x.Region,x.Year,x.EffectiveFrom,x.EffectiveTo,x.PolicyVersion,x.Source,x.Verified,rates=JsonSerializer.Deserialize<InsuranceRate[]>(x.RatesJson,Json),version=x.Version.ToString()});
    public async Task<object> PayrollPolicySave(string user,InsurancePolicySave b) {
        Require(b.Year is >=1900 and <=9998 && b.EffectiveFrom<=b.EffectiveTo && b.EffectiveFrom.Year<=b.Year && b.EffectiveTo.Year>=b.Year,"政策年度或生效区间无效");
        Require(b.Rates is {Length: >0 and <=6} && b.Rates.Select(x=>x.Kind).Distinct().Count()==b.Rates.Length,"险种重复或数量无效");
        foreach(var rate in b.Rates){Require(rate.Kind is "Pension" or "Medical" or "Unemployment" or "WorkInjury" or "Maternity" or "HousingFund","险种无效");Require(Nonnegative(rate.Lower)<=Nonnegative(rate.Upper),"缴费基数范围无效");PayrollTaxMath.Rate(rate.PersonalRate);PayrollTaxMath.Rate(rate.EmployerRate);Require(rate.CollectedWith=="" || rate.CollectedWith!=rate.Kind && b.Rates.Any(x=>x.Kind==rate.CollectedWith && x.Applicable && x.CollectedWith==""),"合并征缴须指向其他适用险种");}
        var x=new SocialInsurancePolicy{UserId=user,Name=Text(b.Name,200,true),Region=Text(b.Region,200,true),Year=b.Year,EffectiveFrom=b.EffectiveFrom,EffectiveTo=b.EffectiveTo,PolicyVersion=Text(b.PolicyVersion,100,true),Source=Text(b.Source,2000,true),Verified=b.Verified,RatesJson=JsonSerializer.Serialize(b.Rates,Json)};db.Add(x);return new{x.Id,version="1"};
    }
    public async Task<object> PayrollContributions(string user,IQueryCollection query) {
        var(page,size)=Paging(query);var q=db.Set<SocialContributionRecord>().AsNoTracking().Where(x=>x.UserId==user && x.SourceEvidence!=DeletedPayrollContributionSource);var housing=query["housing"].ToString();var month=query["month"].ToString();if(housing!="")q=q.Where(x=>housing=="true"?x.Kind=="HousingFund":x.Kind!="HousingFund");if(month!="")q=q.Where(x=>x.Month==month);
        var total=await q.CountAsync();var rows=await q.OrderByDescending(x=>x.Month).ThenByDescending(x=>x.CreatedAt).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{items=rows.Select(x=>new{x.Id,x.Month,x.PaidDate,x.Region,x.Kind,x.Currency,x.State,x.EmploymentId,x.PolicyId,x.FundAccountId,x.PayrollId,x.PaymentStatus,x.SourceEvidence,x.Note,basis=M(x.Basis),personalAmount=M(x.PersonalAmount),employerAmount=M(x.EmployerAmount),personalRate=x.PersonalRate.ToString(CultureInfo.InvariantCulture),employerRate=x.EmployerRate.ToString(CultureInfo.InvariantCulture),expectedPersonal=M(x.ExpectedPersonal),expectedEmployer=M(x.ExpectedEmployer),personalDifference=M(x.PersonalAmount-x.ExpectedPersonal),employerDifference=M(x.EmployerAmount-x.ExpectedEmployer),version=x.Version.ToString()}),total,page,pageSize=size};
    }
    public async Task<object> PayrollContributionSave(string user,ContributionSave b,string? id,string? version) {
        Require(b.SourceEvidence!=DeletedPayrollContributionSource,"来源标记不可用");
        Month(b.Month);if(b.State=="Confirmed")AssetDate(b.PaidDate);else PayrollDate(b.PaidDate);AssetCurrency(b.Currency);Require(b.Kind is "Pension" or "Medical" or "Unemployment" or "WorkInjury" or "Maternity" or "HousingFund","险种无效");Require(b.State is "Pending" or "Confirmed" or "Cancelled" && b.PaymentStatus is "Normal" or "Supplementary" or "Arrears" or "Adjustment","缴费状态无效");
        if(b.EmploymentId!=null)await PayOwned<PayrollEmployment>(user,b.EmploymentId);
        if(b.FundAccountId!=null){var fund=await PayOwned<HousingFundAccount>(user,b.FundAccountId);Require(b.Kind=="HousingFund" && fund.Currency==b.Currency && (b.EmploymentId==null || fund.EmploymentId==b.EmploymentId),"公积金账户不适用");}
        if(b.PayrollId!=null){var pay=await PayrollEntity(user,b.PayrollId);Require(pay.Currency==b.Currency && pay.State is not ("Cancelled" or "Voided") && (b.EmploymentId==null || pay.EmploymentId==b.EmploymentId),"工资条不适用");}
        var basis=Nonnegative(b.Basis);decimal pr=0,er=0,ep=0,ee=0;
        if(b.PolicyId!=null){var policy=await PayOwned<SocialInsurancePolicy>(user,b.PolicyId);var d=DateOnly.Parse(b.Month+"-01",CultureInfo.InvariantCulture);Require(policy.Region==b.Region && policy.Year==d.Year && policy.EffectiveFrom<=d.AddMonths(1).AddDays(-1) && policy.EffectiveTo>=d,"缴费政策地区或期间不适用");
            var rate=JsonSerializer.Deserialize<InsuranceRate[]>(policy.RatesJson,Json)!.SingleOrDefault(x=>x.Kind==b.Kind)??throw new ApiException(422,"政策未配置该险种");Require(rate.Applicable && rate.CollectedWith=="","不适用或合并征缴险种不能单独计提");
            pr=PayrollTaxMath.Rate(rate.PersonalRate);er=PayrollTaxMath.Rate(rate.EmployerRate);var bounded=Math.Clamp(basis,Nonnegative(rate.Lower),Nonnegative(rate.Upper));ep=PayrollTaxMath.Round(bounded*pr);ee=PayrollTaxMath.Round(bounded*er);
        }
        var x=id==null?new SocialContributionRecord{UserId=user}:await PayOwned<SocialContributionRecord>(user,id);if(id!=null){Require(x.SourceEvidence!=DeletedPayrollContributionSource,"缴费记录已删除");Version(x,version);x.Version++;}
        x.Month=b.Month;x.PaidDate=b.PaidDate;x.Region=Text(b.Region,200,true);x.Kind=b.Kind;x.Currency=b.Currency;x.Basis=basis;x.PersonalAmount=Nonnegative(b.PersonalAmount);x.EmployerAmount=Nonnegative(b.EmployerAmount);x.State=b.State;x.EmploymentId=b.EmploymentId;x.PolicyId=b.PolicyId;x.FundAccountId=b.FundAccountId;x.PayrollId=b.PayrollId;x.PaymentStatus=b.PaymentStatus;x.Supplementary=b.PaymentStatus=="Supplementary";x.SourceEvidence=b.SourceEvidence==PayrollContributionSource?"工资条扣款（已手动核对）":Text(b.SourceEvidence,2000);x.Note=Text(b.Note,2000);x.PersonalRate=pr;x.EmployerRate=er;x.ExpectedPersonal=ep;x.ExpectedEmployer=ee;x.UpdatedAt=DateTimeOffset.UtcNow;
        if(b.PayrollId!=null)db.RemoveRange(await db.Set<SocialContributionRecord>().Where(r=>r.UserId==user && r.Id!=x.Id && r.PayrollId==b.PayrollId && r.Kind==b.Kind && r.SourceEvidence==PayrollContributionSource).ToArrayAsync());
        if(id==null)db.Add(x);return new{x.Id,expectedPersonal=M(ep),expectedEmployer=M(ee),version=x.Version.ToString(),cashImpact="0.00"};
    }
    public async Task<object> PayrollLegacyBalances(string user) => (await db.Set<SocialContributionRecord>().AsNoTracking().Where(x=>x.UserId==user && x.Kind=="HousingFund" && x.FundAccountId==null && x.ReportedBalance!=null && x.State!="Cancelled").OrderByDescending(x=>x.PaidDate).ToArrayAsync()).Select(x=>new{x.Id,x.Month,x.PaidDate,x.Region,x.Currency,reportedBalance=M(x.ReportedBalance!.Value),x.BalanceSource,x.Note});
    public async Task<object> PayrollFundAccounts(string user) => (await db.Set<HousingFundAccount>().AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync()).Select(x=>new{x.Id,x.Name,x.City,x.Currency,x.EmploymentId,x.AccountId,x.LoanBusinessId,reportedBalance=M(x.ReportedBalance),x.BalanceDate,x.BalanceSource,x.Evidence,x.Status,version=x.Version.ToString(),netWorthAddition="0.00"});
    public async Task<object> PayrollFundSave(string user,FundAccountSave b,string? id,string? version) {
        AssetCurrency(b.Currency);AssetDate(b.BalanceDate);if(b.EmploymentId!=null)await PayOwned<PayrollEmployment>(user,b.EmploymentId);
        if(b.AccountId!=null){var a=await Account(user,b.AccountId,false);Require(a.Currency==b.Currency && a.Type is not ("CreditCard" or "Payable" or "ConsumerLoan" or "ConsumerCredit" or "SecuredLoan"),"须关联同币种资产账户");}
        if(b.LoanBusinessId!=null){var loan=await BusinessEntity(user,b.LoanBusinessId);Require(loan.Kind=="Borrowed" && loan.Currency==b.Currency,"请选择同币种已有贷款");}
        Require(b.BalanceSource is "ManualStatement" or "ProviderStatement" && b.Status is "Active" or "Transferred" or "Closed","余额来源或账户状态无效");
        var x=id==null?new HousingFundAccount{UserId=user}:await PayOwned<HousingFundAccount>(user,id);if(id!=null){Version(x,version);x.Version++;}
        x.Name=Text(b.Name,200,true);x.City=Text(b.City,200,true);x.Currency=b.Currency;x.ReportedBalance=Nonnegative(b.ReportedBalance);x.BalanceDate=b.BalanceDate;x.BalanceSource=b.BalanceSource;x.Evidence=Text(b.Evidence,2000,true);x.EmploymentId=b.EmploymentId;x.AccountId=b.AccountId;x.LoanBusinessId=b.LoanBusinessId;x.Status=b.Status;x.UpdatedAt=DateTimeOffset.UtcNow;if(id==null)db.Add(x);return new{x.Id,version=x.Version.ToString(),netWorthAddition="0.00"};
    }
    public async Task<object> PayrollFundEvents(string user) => (await db.Set<HousingFundEvent>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.BusinessDate).ToArrayAsync()).Select(x=>new{x.Id,x.FundAccountId,x.Kind,x.Month,x.BusinessDate,amount=M(x.Amount),x.Currency,x.Status,x.TransactionId,x.Evidence,version=x.Version.ToString()});
    public async Task<object> PayrollFundEventSave(string user,FundEventSave b) {
        var fund=await PayOwned<HousingFundAccount>(user,b.FundAccountId);Month(b.Month);if(b.Status=="Received")AssetDate(b.BusinessDate);else PayrollDate(b.BusinessDate);Require(b.Currency==fund.Currency && b.Kind is "Deposit" or "Supplementary" or "Withdrawal" or "Interest" or "TransferIn" or "TransferOut" && b.Status is "Expected" or "Received" or "Cancelled","公积金记录无效");
        if(b.TransactionId!=null){var t=await Transaction(user,b.TransactionId);Require(t.Currency==b.Currency && t.Status=="Confirmed","实际交易不适用");if(fund.AccountId!=null)Require(t.AccountId==fund.AccountId || t.ToAccountId==fund.AccountId,"交易未涉及该公积金资产账户");}
        var x=new HousingFundEvent{UserId=user,FundAccountId=fund.Id,Kind=b.Kind,Month=b.Month,BusinessDate=b.BusinessDate,Amount=Money(b.Amount,true),Currency=b.Currency,Status=b.Status,Evidence=Text(b.Evidence,2000,true),TransactionId=b.TransactionId};db.Add(x);return new{x.Id,version="1",netWorthAddition="0.00",cashImpact="0.00"};
    }
    public async Task<object> PayrollTaxRules(string user) => (await db.Set<PayrollTaxRule>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.EffectiveFrom).ToArrayAsync()).Select(x=>new{x.Id,x.Name,x.PolicyVersion,x.EffectiveFrom,x.EffectiveTo,x.Source,x.Verified,rules=JsonSerializer.Deserialize<TaxRules>(x.RulesJson,Json),version=x.Version.ToString()});
    public async Task<object> PayrollTaxRuleSave(string user,TaxRuleSave b) {
        Require(b.EffectiveFrom<=b.EffectiveTo,"税务规则生效区间无效");PayrollTaxMath.Validate(b.Rules);
        var x=new PayrollTaxRule{UserId=user,Name=Text(b.Name,200,true),PolicyVersion=Text(b.PolicyVersion,100,true),EffectiveFrom=b.EffectiveFrom,EffectiveTo=b.EffectiveTo,Source=Text(b.Source,4000,true),Verified=b.Verified,RulesJson=JsonSerializer.Serialize(b.Rules,Json)};db.Add(x);return new{x.Id,version="1"};
    }
    public async Task<object> PayrollDeclarations(string user) => (await db.Set<PayrollTaxDeclaration>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.Year).ToArrayAsync()).Select(x=>new{x.Id,x.EmploymentId,x.RuleId,x.Kind,x.Year,x.StartMonth,x.EndMonth,claimedAmount=M(x.ClaimedAmount),approvedAmount=M(x.ApprovedAmount),eligibility=JsonSerializer.Deserialize<JsonElement>(x.EligibilityJson,Json),x.Evidence,x.Status,version=x.Version.ToString()});
    public async Task<object> PayrollDeclarationSave(string user,DeclarationSave b,string? id,string? version) {
        await PayOwned<PayrollEmployment>(user,b.EmploymentId);var policy=await PayOwned<PayrollTaxRule>(user,b.RuleId);var rules=JsonSerializer.Deserialize<TaxRules>(policy.RulesJson,Json)!;
        Require(b.Year is >=1900 and <=9998 && b.StartMonth is >=1 and <=12 && b.EndMonth>=b.StartMonth && b.EndMonth<=12 && policy.EffectiveFrom.Year<=b.Year && policy.EffectiveTo.Year>=b.Year,"扣除年度或月份区间无效");
        var rule=rules.Deductions.SingleOrDefault(x=>x.Kind==b.Kind)??throw new ApiException(422,"规则未配置该扣除项目");Require(b.Status is "Pending" or "Reviewed" or "Rejected","扣除核对状态无效");
        Require(b.Eligibility.ValueKind==JsonValueKind.Object,"资格核对信息必须为结构化记录");
        var eligible=b.Eligibility.ValueKind==JsonValueKind.Object && b.Eligibility.TryGetProperty("qualifies",out var yes) && yes.ValueKind==JsonValueKind.True;
        var approved=0m;var claimed=Nonnegative(b.ClaimedAmount);Text(b.Eligibility.GetRawText(),8000);
        if(b.Status=="Reviewed"){
            Require(policy.Verified && eligible && Text(b.Evidence,2000,true).Length>0,"扣除须使用已核验规则、核对资格并提供依据");
            var cap=Money(rule.MonthlyLimit);
            if(b.Kind is "ChildEducation" or "InfantCare"){
                Require(b.Eligibility.TryGetProperty("units",out var units) && units.TryGetInt32(out var n) && n is >=1 and <=10,"须核对子女数量");
                var nUnits=b.Eligibility.GetProperty("units").GetInt32();Require(b.Eligibility.TryGetProperty("share",out var share) && (share.ValueKind==JsonValueKind.Number?share.TryGetDecimal(out var shareValue) && shareValue is >0 and <=1:share.ValueKind==JsonValueKind.String && decimal.TryParse(share.GetString(),NumberStyles.AllowDecimalPoint,CultureInfo.InvariantCulture,out var shareText) && shareText is >0 and <=1),"须核对分摊比例");cap*=nUnits*(b.Eligibility.GetProperty("share").ValueKind==JsonValueKind.Number?b.Eligibility.GetProperty("share").GetDecimal():decimal.Parse(b.Eligibility.GetProperty("share").GetString()!,CultureInfo.InvariantCulture));
            }
            if(b.Kind=="ElderCare" && (!b.Eligibility.TryGetProperty("onlyChild",out var only) || only.ValueKind!=JsonValueKind.True)) cap/=2;
            if(b.Kind is "HousingRent" or "MortgageInterest")Require(b.Eligibility.TryGetProperty("housingExclusive",out var exclusive) && exclusive.ValueKind==JsonValueKind.True,"须核对夫妻年度住房租金和贷款利息互斥条件");
            Require(claimed<=cap,"申报金额超过规则及分摊条件限额");approved=claimed;
            if(b.Kind is "HousingRent" or "MortgageInterest")Require(!await db.Set<PayrollTaxDeclaration>().AnyAsync(x=>x.UserId==user && x.Id!=id && x.Year==b.Year && x.Status=="Reviewed" && (x.Kind=="HousingRent" || x.Kind=="MortgageInterest") && x.Kind!=b.Kind),"同一年度不能同时享受住房租金和贷款利息扣除");
            Require(!await db.Set<PayrollTaxDeclaration>().AnyAsync(x=>x.UserId==user && x.Id!=id && x.Year==b.Year && x.Kind==b.Kind && x.Status=="Reviewed" && x.StartMonth<=b.EndMonth && x.EndMonth>=b.StartMonth),"重叠月份已存在该项核对扣除，防止跨单位重复扣除");
        }
        var x=id==null?new PayrollTaxDeclaration{UserId=user}:await PayOwned<PayrollTaxDeclaration>(user,id);if(id!=null){Version(x,version);x.Version++;}
        x.EmploymentId=b.EmploymentId;x.RuleId=b.RuleId;x.Kind=b.Kind;x.Year=b.Year;x.StartMonth=b.StartMonth;x.EndMonth=b.EndMonth;x.ClaimedAmount=claimed;x.ApprovedAmount=approved;x.EligibilityJson=b.Eligibility.GetRawText();x.Evidence=Text(b.Evidence,2000);x.Status=b.Status;x.UpdatedAt=DateTimeOffset.UtcNow;if(id==null)db.Add(x);return new{x.Id,approvedAmount=M(approved),version=x.Version.ToString()};
    }
    public async Task<object> PayrollSimulateTax(string user,TaxSimulation b) {
        var e=await PayOwned<PayrollEmployment>(user,b.EmploymentId);var p=await PayOwned<PayrollTaxRule>(user,b.RuleId);Month(b.Month);var period=DateOnly.Parse(b.Month+"-01",CultureInfo.InvariantCulture);
        Require(b.Resident && !b.CrossBorder && b.Scenario is "Cumulative" or "Annual" or "BonusSeparate" or "BonusCombined","仅支持境内居民工资薪金模拟；非居民或跨境情况需独立规则");
        Require(p.Verified && p.EffectiveFrom<=period && p.EffectiveTo>=period,"规则未核验或不在生效期间");var r=JsonSerializer.Deserialize<TaxRules>(p.RulesJson,Json)!;PayrollTaxMath.Validate(r);
        Require(e.StartDate<=period.AddMonths(1).AddDays(-1),"模拟月份早于入职日期");
        var employedMonths=period.Month-(e.StartDate.Year==period.Year?e.StartDate.Month:1)+1;
        Require(b.Scenario=="Annual" || b.ExpenseMonths<=employedMonths,"累计费用减除月份超过本单位当年任职月份");
        Require(b.ExpenseMonths is >=1 and <=12 && (b.Scenario=="Annual" || b.ExpenseMonths<=period.Month),"累计费用减除月份无效");
        var income=Nonnegative(b.TaxableIncome);var exempt=Nonnegative(b.ExemptIncome);var special=Nonnegative(b.SpecialDeductions);var other=Nonnegative(b.OtherDeductions);var relief=Nonnegative(b.TaxRelief);var withheld=Nonnegative(b.AlreadyWithheld);var actual=Nonnegative(b.ActualTax);var bonus=Nonnegative(b.Bonus);
        var declarations=await db.Set<PayrollTaxDeclaration>().AsNoTracking().Where(x=>x.UserId==user && x.Year==period.Year && x.RuleId==p.Id && x.Status=="Reviewed" && (b.Scenario=="Annual" || x.EmploymentId==e.Id)).ToArrayAsync();
        decimal additional=0;
        foreach(var d in declarations){var rule=r.Deductions.Single(x=>x.Kind==d.Kind);if(rule.AnnualOnly){if(b.Scenario=="Annual")additional+=d.ApprovedAmount;}else{var end=Math.Min(d.EndMonth,b.Scenario=="Annual"?12:period.Month);additional+=d.ApprovedAmount*Math.Max(0,end-d.StartMonth+1);}}
        var expense=Money(r.MonthlyExpense)*(b.Scenario=="Annual"?12:b.ExpenseMonths);var basis=Math.Max(0,income-exempt-expense-special-additional-other);var annualTax=PayrollTaxMath.Tax(basis,r.AnnualBrackets);decimal bonusSeparate=0;
        if(b.Scenario=="BonusSeparate") {Require(b.BonusEligible && period<=r.BonusUntil,"年终奖资格未核对或政策已到期");var band=r.BonusBrackets.FirstOrDefault(x=>Money(x.Upper)>=bonus/12)??throw new ApiException(422,"奖金超出税率表范围");bonusSeparate=PayrollTaxMath.Round(Math.Max(0,bonus*PayrollTaxMath.Rate(band.Rate)-Money(band.Quick)));}
        if(b.Scenario=="BonusCombined") {basis=Math.Max(0,income+bonus-exempt-expense-special-additional-other);annualTax=PayrollTaxMath.Tax(basis,r.AnnualBrackets);}
        Require(bonus==0 || b.Scenario is "BonusSeparate" or "BonusCombined","奖金金额仅用于奖金情景，请明确选择处理方式");
        var total=PayrollTaxMath.Round(Math.Max(0,annualTax-relief)+bonusSeparate);var due=PayrollTaxMath.Round(Math.Max(0,total-withheld));
        var result=new{currency="CNY",taxableBasis=M(basis),expenseDeduction=M(expense),additionalDeduction=M(additional),annualTax=M(annualTax),bonusTax=M(bonusSeparate),totalTax=M(total),currentWithholding=M(due),actualTax=M(actual),difference=M(actual-due),potentialAnnualRefund=M(Math.Max(0,withheld-total)),ruleVersion=p.PolicyVersion,b.Scenario,scope="CNResidentSalary",notes="模拟不是申报；按发薪年度和单一扣缴单位累计口径。年度情景仅为工资薪金情景，不涵盖全部综合所得。多单位年度减除费用仅一次；未核对扣除和大病医疗不纳入月度预扣。已预扣超额不在月度自动退税。"};
        var inputSnapshot=JsonSerializer.SerializeToNode(b,Json)!.AsObject();
        inputSnapshot["deductionSnapshot"]=JsonSerializer.SerializeToNode(declarations.Select(d=>new{d.Id,d.Version,d.Kind,d.Year,d.StartMonth,d.EndMonth,approvedAmount=M(d.ApprovedAmount),d.RuleId,d.Status}),Json);
        var calc=new PayrollTaxCalculation{UserId=user,EmploymentId=e.Id,RuleId=p.Id,Month=b.Month,InputsJson=inputSnapshot.ToJsonString(),ResultsJson=JsonSerializer.Serialize(result,Json)};db.Add(calc);return new{calc.Id,result};
    }
    public async Task<object> PayrollTaxCalculations(string user) => (await db.Set<PayrollTaxCalculation>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.CreatedAt).Take(100).ToArrayAsync()).Select(x=>new{x.Id,x.RuleId,x.EmploymentId,x.Month,x.CreatedAt,inputs=JsonSerializer.Deserialize<JsonElement>(x.InputsJson,Json),result=JsonSerializer.Deserialize<JsonElement>(x.ResultsJson,Json)});
}
