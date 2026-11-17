using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> PayrollCenterStatistics(string user,IQueryCollection query) {
        var year=int.TryParse(query["year"],out var y)?y:DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Year;Require(year is >=1901 and <=9997,"年度无效");
        var currency=query["currency"].ToString();if(currency=="")currency="CNY";AssetCurrency(currency);var basis=query["basis"].ToString()=="Paid"?"Paid":"Earned";var employment=query["employmentId"].ToString();
        var start=new DateOnly(year-1,1,1);var end=new DateOnly(year+1,1,1);var min=(year-1).ToString()+"-01";var max=(year+1).ToString()+"-01";
        var all=await db.Set<PayrollStatement>().AsNoTracking().Where(x=>x.UserId==user && x.Currency==currency && x.State!="Draft" && x.State!="PendingReview" && x.State!="Cancelled" && x.State!="Voided" && (employment=="" || x.EmploymentId==employment) && (basis=="Paid"?x.PayDate>=start && x.PayDate<end:string.Compare(x.Month,min)>=0 && string.Compare(x.Month,max)<0)).ToArrayAsync();
        var ids=all.Select(x=>x.Id).ToArray();var items=await db.Set<PayrollComponent>().AsNoTracking().Where(x=>x.UserId==user && ids.Contains(x.PayrollId)).ToArrayAsync();var links=await (from l in db.Set<PayrollPayment>() join t in db.Transactions on l.TransactionId equals t.Id where l.UserId==user && ids.Contains(l.PayrollId) && t.Status=="Confirmed" select new{l.PayrollId,t.Amount,t.OccurredAt}).ToArrayAsync();
        string Period(PayrollStatement x)=>basis=="Paid"?x.PayDate.ToString("yyyy-MM"):x.Month;
        object Aggregate(PayrollStatement[] slips){var set=slips.Select(x=>x.Id).ToHashSet();var parts=items.Where(x=>set.Contains(x.PayrollId)).ToArray();var(gross,deductions,net)=PayrollMath.Calculate(parts);var pay=links.Where(x=>set.Contains(x.PayrollId)).Sum(x=>x.Amount);
            decimal Sum(string category,string kind)=>parts.Where(x=>x.Kind==kind && x.Category==category).Sum(x=>x.Amount);
            return new{count=slips.Length,gross=M(gross),deductions=M(deductions),net=M(net),actual=M(pay),difference=M(pay-net),annualBonus=M(Sum("AnnualBonus","Earning")),basePay=M(Sum("Base","Earning")),performance=M(Sum("Performance","Earning")+Sum("QuarterlyBonus","Earning")+Sum("Commission","Earning")),tax=M(Sum("Tax","Deduction")),personalSocial=M(Sum("Pension","Deduction")+Sum("Medical","Deduction")+Sum("Unemployment","Deduction")),personalHousing=M(Sum("HousingFund","Deduction")),baseShare=gross==0?null:M(Sum("Base","Earning")/gross*100),performanceShare=gross==0?null:M((Sum("Performance","Earning")+Sum("QuarterlyBonus","Earning")+Sum("Commission","Earning"))/gross*100),deductionShare=gross==0?null:M(deductions/gross*100)};}
        var current=all.Where(x=>Period(x).StartsWith(year.ToString(),StringComparison.Ordinal)).ToArray();
        decimal Net(string month)=>PayrollMath.Calculate(items.Where(i=>all.Any(s=>s.Id==i.PayrollId && Period(s)==month))).net;
        var months=Enumerable.Range(1,12).Select(m=>{var key=$"{year}-{m:00}";var previous=DateOnly.Parse(key+"-01",CultureInfo.InvariantCulture).AddMonths(-1).ToString("yyyy-MM");var net=Net(key);var prev=Net(previous);var prior=Net($"{year-1}-{m:00}");return new{month=key,totals=Aggregate(current.Where(x=>Period(x)==key).ToArray()),mom=!current.Any(x=>Period(x)==key)||prev==0?null:M((net-prev)/prev*100),yoy=!current.Any(x=>Period(x)==key)||prior==0?null:M((net-prior)/prior*100)};}).ToArray();
        var contributions=await db.Set<SocialContributionRecord>().AsNoTracking().Where(x=>x.UserId==user && x.Currency==currency && x.Month.StartsWith(year.ToString()+"-") && x.State!="Cancelled" && (employment=="" || x.EmploymentId==employment)).ToArrayAsync();
        var funds=await db.Set<HousingFundAccount>().AsNoTracking().Where(x=>x.UserId==user && x.Currency==currency && x.Status!="Closed" && (employment=="" || x.EmploymentId==employment)).ToArrayAsync();
        var events=await db.Set<HousingFundEvent>().AsNoTracking().Where(x=>x.UserId==user && x.Currency==currency && x.Month.StartsWith(year.ToString()+"-") && x.Status!="Cancelled").ToArrayAsync();
        return new{year,currency,basis,totals=Aggregate(current),months,employers=current.GroupBy(x=>x.EmploymentId??x.Employer).Select(g=>new{employmentId=g.First().EmploymentId,employer=g.First().Employer,totals=Aggregate(g.ToArray())}),
            structure=items.Where(x=>current.Any(s=>s.Id==x.PayrollId)).GroupBy(x=>new{x.Kind,x.Category}).Select(g=>new{g.Key.Kind,g.Key.Category,amount=M(g.Sum(x=>x.Amount))}),
            benefits=new{socialPersonal=M(contributions.Where(x=>x.Kind!="HousingFund" && x.State=="Confirmed").Sum(x=>x.PersonalAmount)),socialEmployer=M(contributions.Where(x=>x.Kind!="HousingFund" && x.State=="Confirmed").Sum(x=>x.EmployerAmount)),housingPersonal=M(contributions.Where(x=>x.Kind=="HousingFund" && x.State=="Confirmed").Sum(x=>x.PersonalAmount)),housingEmployer=M(contributions.Where(x=>x.Kind=="HousingFund" && x.State=="Confirmed").Sum(x=>x.EmployerAmount)),housingExpected=M(contributions.Where(x=>x.Kind=="HousingFund" && x.State=="Pending").Sum(x=>x.PersonalAmount+x.EmployerAmount)),reportedFundBalance=M(funds.Sum(x=>x.ReportedBalance)),fundBalances=funds.Select(x=>new{x.Id,x.BalanceDate,x.BalanceSource,balance=M(x.ReportedBalance)}),expectedEvents=M(events.Where(x=>x.Status=="Expected" && x.Kind is "Deposit" or "Supplementary").Sum(x=>x.Amount)),receivedEvents=M(events.Where(x=>x.Status=="Received" && x.Kind is "Deposit" or "Supplementary").Sum(x=>x.Amount))},
            pendingCount=await db.Set<PayrollStatement>().CountAsync(x=>x.UserId==user && x.Currency==currency && x.Month.StartsWith(year.ToString()+"-") && (x.State=="Draft" || x.State=="PendingReview")),
            notes="归属口径按工资月份，发薪口径按工资条发薪日期；actual为所选工资条关联到账金额，不等同当年银行现金流。报表排除草稿与作废。缴费按归属月独立统计；实际余额含各自核对日期，不由预计缴存推算，也不再次加入净资产。"};
    }
    public async Task<object> PayrollCenterCalendar(string user,IQueryCollection query) {
        var month=query["month"].ToString();if(month=="")month=DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM");Month(month);var start=DateOnly.Parse(month+"-01",CultureInfo.InvariantCulture);var end=start.AddMonths(1);
        var actual=await db.Set<PayrollStatement>().AsNoTracking().Where(x=>x.UserId==user && x.PayDate>=start && x.PayDate<end && x.State!="Cancelled" && x.State!="Voided").Select(x=>new{x.Id,date=x.PayDate,name=x.Employer,x.Month,x.Currency,x.State,kind="Slip"}).ToArrayAsync();
        var jobs=await db.Set<PayrollEmployment>().AsNoTracking().Where(x=>x.UserId==user && x.StartDate<end && (x.EndDate==null || x.EndDate>=start) && x.Status=="Active" && x.PayCycle=="Monthly").ToArrayAsync();
        return new{month,slips=actual,expected=jobs.Select(x=>new{x.Id,date=new DateOnly(start.Year,start.Month,Math.Min(x.PayDay,DateTime.DaysInMonth(start.Year,start.Month))),name=x.Position,kind="Expected",x.PayCycle}),note="预计发薪日仅为计划；周薪、双周薪及不定期工作仅显示已登记工资条。"};
    }
    public async Task<object> PayrollMatchCandidates(string user,string id,int tolerance) {
        Require(tolerance is >=0 and <=90,"日期容差须为0至90天");var p=await PayrollEntity(user,id);var parts=await db.Set<PayrollComponent>().Where(x=>x.UserId==user && x.PayrollId==id).ToArrayAsync();var net=PayrollMath.Calculate(parts).net;
        var start=new DateTimeOffset(p.PayDate.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(8)).AddDays(-tolerance);var end=start.AddDays(tolerance*2+1);
        var candidates=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user && x.Type=="Income" && x.Status=="Confirmed" && x.Currency==p.Currency && x.OccurredAt>=start && x.OccurredAt<end && (p.AccountId==null || x.AccountId==p.AccountId)).OrderByDescending(x=>x.OccurredAt).Take(100).ToArrayAsync();
        var used=await db.Set<PayrollPayment>().Where(x=>x.UserId==user).Select(x=>x.TransactionId).ToArrayAsync();
        return new{items=candidates.Select(x=>new{x.Id,amount=M(x.Amount),x.Currency,x.AccountId,x.OccurredAt,x.Merchant,x.Note,amountMatches=x.Amount==net,employerMatches=(x.Merchant??"").Contains(p.Employer) || (x.Note??"").Contains(p.Employer),state=used.Contains(x.Id)?"Duplicate":x.Amount==net?"Matched":"AmountMismatch"}),expected=M(net),note="候选不是自动确认；分批到账请逐笔确认。"};
    }
    public async Task<object> PayrollCenterReconcile(string user,string id,PayrollMatch b,string? version) {
        var p=await PayrollEntity(user,id);Version(p,version);Require(p.State is "Confirmed" or "Paid" or "Reconciled","须先确认工资条");var t=await Transaction(user,b.TransactionId);Require(b.DateToleranceDays is >=0 and <=90,"日期容差无效");var date=DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).DateTime);
        Require(b.ManualConfirmed || Math.Abs(date.DayNumber-p.PayDate.DayNumber)<=b.DateToleranceDays,"到账日期不符，须人工确认");Require(b.ManualConfirmed || p.AccountId==null || p.AccountId==t.AccountId,"到账账户不符，须人工确认");if(b.ManualConfirmed)Text(b.Reason,1000,true);
        await SavePayrollRevision(user,p,"Reconcile",b.Reason);var result=await ReconcilePayroll(user,id,new(b.TransactionId),version);var rows=await db.Set<PayrollComponent>().Where(x=>x.UserId==user && x.PayrollId==id).ToArrayAsync();
        var existing=await (from l in db.Set<PayrollPayment>() join tx in db.Transactions on l.TransactionId equals tx.Id where l.UserId==user && l.PayrollId==id && tx.Status=="Confirmed" select (decimal?)tx.Amount).SumAsync()??0;
        p.State=existing+t.Amount==PayrollMath.Calculate(rows).net?"Reconciled":"Paid";return new{p.Id,p.State,version=p.Version.ToString(),cashImpact="0.00",transactionId=t.Id};
    }
    public async Task<object> PayrollAiCenterEvidence(string user,IQueryCollection query) {
        var stats=JsonSerializer.SerializeToElement(await PayrollCenterStatistics(user,query),Json);var evidenceCurrency=stats.GetProperty("currency").GetString();var evidenceYear=stats.GetProperty("year").GetInt32().ToString(CultureInfo.InvariantCulture)+"-";var calculations=await db.Set<PayrollTaxCalculation>().AsNoTracking().Where(x=>x.UserId==user && evidenceCurrency=="CNY" && x.Month.StartsWith(evidenceYear)).OrderByDescending(x=>x.CreatedAt).Take(12).ToArrayAsync();
        return new{year=stats.GetProperty("year"),currency=stats.GetProperty("currency"),totals=stats.GetProperty("totals"),months=stats.GetProperty("months"),benefits=stats.GetProperty("benefits"),structure=stats.GetProperty("structure"),simulations=calculations.Select(x=>new{x.Month,result=JsonSerializer.Deserialize<JsonElement>(x.ResultsJson,Json)}),note="仅使用已记录薪酬事实和规则引擎历史模拟。缺失信息不可推测；调薪与换城市情景应先运行中心模拟器。"};
    }
}
