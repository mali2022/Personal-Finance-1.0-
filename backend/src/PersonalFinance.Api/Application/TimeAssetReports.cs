using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> TimeReport(string user,DateOnly from,DateOnly to,string currency,string? projectId=null)
    {
        Require(from.Year>=1901&&to.Year<=9997&&to>from&&to.DayNumber-from.DayNumber<=366,"统计期间须为1至366天，结束日期不含当天");Require(CurrencyDefinitions.Supports(currency),"币种无效");
        if(projectId!=null)await TimeProjectCheck(user,projectId);
        var start=TimeAssetMath.Shanghai(from);var plannedEnd=TimeAssetMath.Shanghai(to);var now=DateTimeOffset.UtcNow;var end=plannedEnd<now?plannedEnd:now;
        Require(start<end,"尚未开始的期间没有已发生时间统计");
        var activities=await db.Set<TimeActivity>().AsNoTracking().Where(x=>x.UserId==user&&(projectId==null||x.ProjectId==projectId)).Take(10001).ToArrayAsync();Require(activities.Length<=10000,"时间记录超过单次分析上限，请归档旧记录后重试");
        var selected=activities.Select(a=>new{activity=a,segments=TimeSegments(a,now).Where(s=>s.Start<end&&s.End>start).ToArray()}).Where(x=>x.segments.Length>0).ToArray();
        var allSegments=selected.SelectMany(x=>x.segments).ToArray();var recorded=TimeAssetMath.UnionSeconds(allSegments,start,end);var elapsed=(decimal)(end-start).TotalSeconds;
        var values=await db.Set<TimeValuation>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.EffectiveFrom).ThenByDescending(x=>x.Revision).ToArrayAsync();
        var fx=await db.Set<FxValuationRate>().AsNoTracking().Where(x=>x.UserId==user&&x.TargetCurrency==currency&&x.Date<=to).ToArrayAsync();
        decimal? Convert(decimal amount,string source,DateOnly date){if(amount==0||source==currency)return amount;var rate=FxRateSelection.Select(fx,source,currency,date);return rate==null?null:amount*rate.Rate;}
        decimal? Cost(IEnumerable<TimeSegment> segments,out decimal valuedSeconds){decimal sum=0;valuedSeconds=0;bool missing=false;
            foreach(var segment in segments){var cursor=segment.Start>start?segment.Start:start;var stop=segment.End<end?segment.End:end;
                while(cursor<stop){var day=DateOnly.FromDateTime(cursor.ToOffset(TimeSpan.FromHours(8)).Date);var next=TimeAssetMath.Shanghai(day.AddDays(1));if(next>stop)next=stop;var seconds=(decimal)(next-cursor).TotalSeconds;
                    var v=values.FirstOrDefault(x=>x.EffectiveFrom<=day);var amount=v==null?null:Convert(seconds/3600*v.HourlyRate,v.Currency,day);if(amount==null)missing=true;else{sum+=amount.Value;valuedSeconds+=seconds;}cursor=next;}}
            return missing?null:sum;
        }
        var cost=Cost(allSegments,out var valued);var ids=selected.Select(x=>x.activity.Id).ToArray();
        var projects=await db.Set<TimeProject>().AsNoTracking().Where(x=>x.UserId==user&&(projectId==null||x.Id==projectId)).ToArrayAsync();
        var links=await db.Set<TimeFinanceLink>().AsNoTracking().Where(x=>x.UserId==user&&(projectId==null||x.ProjectId==projectId||x.ActivityId!=null&&ids.Contains(x.ActivityId))).ToArrayAsync();
        var linkIds=links.Where(x=>x.ActivityId!=null&&ids.Contains(x.ActivityId)||x.ProjectId!=null&&projects.Any(p=>p.Id==x.ProjectId)).Select(x=>x.TransactionId).Distinct().ToArray();
        var tx=await db.Transactions.AsNoTracking().Where(x=>x.UserId==user&&linkIds.Contains(x.Id)&&x.Status!="Deleted"&&x.OccurredAt>=start&&x.OccurredAt<end).ToArrayAsync();
        var txIds=tx.Select(x=>x.Id).ToArray();
        var entries=await db.Entries.AsNoTracking().Where(x=>x.UserId==user&&txIds.Contains(x.TransactionId)&&(x.Kind=="Income"||x.Kind=="Expense")).ToArrayAsync();
        var financeRows=tx.Select(t=>{var date=DateOnly.FromDateTime(t.OccurredAt.ToOffset(TimeSpan.FromHours(8)).Date);var income=-entries.Where(x=>x.TransactionId==t.Id&&x.Kind=="Income").Sum(x=>x.Amount);var expense=entries.Where(x=>x.TransactionId==t.Id&&x.Kind=="Expense").Sum(x=>x.Amount);var cvIncome=Convert(income,t.Currency,date);var cvExpense=Convert(expense,t.Currency,date);var v=values.FirstOrDefault(x=>x.EffectiveFrom<=date);var rate=v==null?null:Convert(v.HourlyRate,v.Currency,date);
            return new{t.Id,t.Type,t.OccurredAt,sourceCurrency=t.Currency,sourceIncome=M(income),sourceExpense=M(expense),income=cvIncome,expense=cvExpense,laborHours=rate>0?cvExpense/rate:null};}).ToArray();
        decimal? SumMoney(IEnumerable<decimal?> amounts){var a=amounts.ToArray();return a.Any(x=>x==null)?null:a.Sum(x=>x??0);}
        var incomeTotal=SumMoney(financeRows.Select(x=>x.income));var expenseTotal=SumMoney(financeRows.Select(x=>x.expense));
        var workSeconds=selected.Where(x=>x.activity.Category is "Work" or "Commute").SelectMany(x=>x.segments).Sum(x=>TimeAssetMath.Seconds(x,start,end));
        var commuteCost=Cost(selected.Where(x=>x.activity.Category=="Commute").SelectMany(x=>x.segments),out _);
        var budgets=await db.Set<TimeBudget>().AsNoTracking().Where(x=>x.UserId==user&&x.StartDate<to).ToArrayAsync();
        var budgetRows=budgets.Where(b=>TimeAssetMath.BudgetEnd(b.Period,b.StartDate)>from).Select(b=>{
            var bs=TimeAssetMath.Shanghai(b.StartDate);var be=TimeAssetMath.Shanghai(TimeAssetMath.BudgetEnd(b.Period,b.StartDate));var clip=be<now?be:now;
            var seconds=activities.Where(x=>b.Category==null||x.Category==b.Category).SelectMany(a=>TimeSegments(a,now)).Sum(s=>TimeAssetMath.Seconds(s,bs,clip));
            return new{b.Id,b.Period,b.StartDate,b.Category,b.Minutes,usedMinutes=decimal.Round(seconds/60,2),progressPercent=TimeAssetMath.Percent(seconds/60,b.Minutes),overMinutes=Math.Max(0,decimal.Round(seconds/60-b.Minutes,2)),version=b.Version.ToString(),scope=projectId==null?"Whole budget period, through now":"Selected project only, whole budget period through now"};}).ToArray();
        var activityRows=selected.Select(x=>{var a=x.activity;var seconds=x.segments.Sum(s=>TimeAssetMath.Seconds(s,start,end));var reference=Cost(x.segments,out var v);return new{a.Id,a.Title,a.Category,a.Note,a.ProjectId,a.State,a.ActiveSince,segments=x.segments,seconds,referenceCost=reference==null?null:M(reference.Value),valuedSeconds=v,version=a.Version.ToString()};}).OrderByDescending(x=>x.segments.Max(s=>s.Start)).ToArray();
        var projectRows=projects.Select(p=>{var rows=selected.Where(x=>x.activity.ProjectId==p.Id).ToArray();var seconds=rows.SelectMany(x=>x.segments).Sum(s=>TimeAssetMath.Seconds(s,start,end));var pc=Cost(rows.SelectMany(x=>x.segments),out _);var aids=rows.Select(x=>x.activity.Id).ToHashSet();var tids=links.Where(l=>l.ProjectId==p.Id||l.ActivityId!=null&&aids.Contains(l.ActivityId)).Select(x=>x.TransactionId).ToHashSet();var f=financeRows.Where(x=>tids.Contains(x.Id)).ToArray();
            var lifetimeSeconds=activities.Where(a=>a.ProjectId==p.Id).SelectMany(a=>TimeSegments(a,now)).Sum(s=>(decimal)(s.End-s.Start).TotalSeconds);
            return new{p.Id,p.Name,p.Goal,p.BudgetMinutes,p.ReturnUnit,p.TargetReturn,p.ActualReturn,p.State,version=p.Version.ToString(),minutes=seconds/60,lifetimeMinutes=lifetimeSeconds/60,budgetProgressPercent=TimeAssetMath.Percent(lifetimeSeconds/60,p.BudgetMinutes),goalProgressPercent=TimeAssetMath.Percent(p.ActualReturn,p.TargetReturn),returnPerHour=lifetimeSeconds>0?p.ActualReturn/(lifetimeSeconds/3600): (decimal?)null,referenceTimeCost=pc,linkedIncome=SumMoney(f.Select(x=>x.income)),linkedExpense=SumMoney(f.Select(x=>x.expense))};}).ToArray();
        return new{from,to,currency,start,endExclusive=end,plannedEndExclusive=plannedEnd,generatedAt=now,isPartial=end<plannedEnd,
            summary=new{recordedSeconds=recorded,elapsedSeconds=elapsed,unrecordedSeconds=Math.Max(0,elapsed-recorded),coveragePercent=TimeAssetMath.Percent(recorded,elapsed),valuedSeconds=valued,valuationCoveragePercent=TimeAssetMath.Percent(valued,recorded),referenceCost=cost,observedDiscretionarySeconds=selected.Where(x=>x.activity.Category is not ("Work" or "Commute" or "Sleep")).SelectMany(x=>x.segments).Sum(s=>TimeAssetMath.Seconds(s,start,end)),linkedIncome=incomeTotal,linkedExpense=expenseTotal,combinedResourceCost=cost+expenseTotal,actualWorkHourlyRate=workSeconds>0?incomeTotal/(workSeconds/3600):null,workAndCommuteSeconds=workSeconds,commuteReferenceCost=commuteCost,missingFxTransactions=financeRows.Count(x=>x.income==null||x.expense==null)},
            categories=TimeAssetMath.Categories.Select(category=>{var seconds=selected.Where(x=>x.activity.Category==category).SelectMany(x=>x.segments).Sum(s=>TimeAssetMath.Seconds(s,start,end));return new{category,seconds,percentOfRecorded=TimeAssetMath.Percent(seconds,recorded),denominatorSeconds=recorded};}),
            trend=Enumerable.Range(0,to.DayNumber-from.DayNumber).Select(i=>{var date=from.AddDays(i);var a=TimeAssetMath.Shanghai(date);var b=a.AddDays(1);if(b>end)b=end;return new{date,seconds=TimeAssetMath.UnionSeconds(allSegments,a,b)};}),
            activities=activityRows,budgets=budgetRows,projects=projectRows,financialLinks=links.Where(l=>l.ProjectId!=null&&projects.Any(p=>p.Id==l.ProjectId)||l.ActivityId!=null&&ids.Contains(l.ActivityId)).Select(l=>new{l.Id,l.TransactionId,l.ActivityId,l.ProjectId,version=l.Version.ToString()}),financialTransactions=financeRows,
            definitions=new{coverage="Recorded union seconds / elapsed seconds in selected period (Asia/Shanghai). Unrecorded time is unknown, never inefficient.",distribution="Category seconds / recorded seconds; overlapping records are rejected.",valuation="Reference only; latest effective valuation on each Shanghai date, direct FX on or before that date. Missing inputs produce null, not zero.",discretionary="Only recorded time outside Work, Commute and Sleep; unrecorded time is not assumed available.",financial="Distinct linked transactions occurring in selected period; signed Income/Expense ledger entries, transfer principal excluded. No financial writes.",actualWorkHourlyRate="Distinct linked income / recorded Work plus Commute hours in selected period; reference association, not verified payroll.",projects="Time and finance inputs cover the selected period; goal achievement is the manually maintained cumulative project metric. Budget progress and returns per hour use lifetime project time; selected-period time and financial inputs are shown separately.",combined="Reference time cost plus linked net expenses; analytical resource measure only, not a book expense. Incomplete conversion produces null."}};
    }
    public async Task<object> TimeCatalog(string user)
    {
        var now=DateTimeOffset.UtcNow;var timers=await db.Set<TimeActivity>().AsNoTracking().Where(x=>x.UserId==user&&x.State!="Completed").ToArrayAsync();
        return new{categories=TimeAssetMath.Categories,timers=timers.Select(a=>new{a.Id,a.Title,a.Category,a.State,a.ActiveSince,seconds=TimeSegments(a,now).Sum(s=>(decimal)(s.End-s.Start).TotalSeconds),version=a.Version.ToString()}),
            valuations=await db.Set<TimeValuation>().AsNoTracking().Where(x=>x.UserId==user).OrderByDescending(x=>x.Revision).ToArrayAsync(),
            templates=await db.Set<TimeTemplate>().AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync(),projects=await db.Set<TimeProject>().AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync()};
    }
}
