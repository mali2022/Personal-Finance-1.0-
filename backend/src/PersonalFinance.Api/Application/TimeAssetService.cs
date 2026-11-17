using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record TimeActivityInput(string Title, string Category, [property:System.Text.Json.Serialization.JsonConverter(typeof(TimeOffsetConverter))] DateTimeOffset Start, [property:System.Text.Json.Serialization.JsonConverter(typeof(TimeOffsetConverter))] DateTimeOffset End, string Note = "", string? ProjectId = null, TimeSegment[]? Segments = null);
public sealed record TimeTimerInput(string Title, string Category, string? ProjectId = null);
public sealed record TimeValuationInput(string Method, string Source, string Currency, DateOnly EffectiveFrom, decimal Income = 0, decimal Hours = 0, decimal HourlyRate = 0);
public sealed record TimeBudgetInput(string Period, DateOnly StartDate, string? Category, int Minutes);
public sealed record TimeTemplateInput(string Name, string Category, int Minutes, string? ProjectId = null, string Repeat = "Daily");
public sealed record TimeProjectInput(string Name, string Goal, int BudgetMinutes, string ReturnUnit, decimal TargetReturn, decimal ActualReturn, string State = "Active");
public sealed record TimeLinkInput(string TransactionId, string? ActivityId = null, string? ProjectId = null);
public sealed partial class FinanceService
{
    internal static TimeSegment[] TimeSegments(TimeActivity a, DateTimeOffset now) => [.. JsonSerializer.Deserialize<TimeSegment[]>(a.SegmentsJson, Json) ?? [], .. a.State == "Running" && a.ActiveSince < now ? new[] {new TimeSegment(a.ActiveSince!.Value, now)} : []];
    async Task<T> TimeOwned<T>(string user, string id) where T : Owned => await db.Set<T>().SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404,"时间资产记录不存在");
    async Task TimeProjectCheck(string user, string? id) { if(id is not null) await TimeOwned<TimeProject>(user,id); }
    static void TimeCategory(string category) => Require(TimeAssetMath.Categories.Contains(category), "时间分类无效");
    async Task TimeNoOverlap(string user, IEnumerable<TimeSegment> input, string? exclude = null)
    {
        var now = DateTimeOffset.UtcNow;
        var segments = input.ToArray();
        Require(segments.Length is >0 and <=100,"活动须包含1至100个片段");
        var sorted=segments.OrderBy(s=>s.Start).ToArray();for(var i=1;i<sorted.Length;i++)Require(sorted[i].Start>=sorted[i-1].End,"活动内片段不能重叠");
        foreach(var s in segments) Require(s.Start < s.End && s.Start.Year >= 1901 && s.End <= now && s.End-s.Start <= TimeSpan.FromDays(31),"活动时间须有效、非未来且每段不超过31天");
        var rows = await db.Set<TimeActivity>().Where(x=>x.UserId==user && x.Id!=exclude).ToArrayAsync();
        var existing = rows.SelectMany(x=>TimeSegments(x,now)).ToArray();
        foreach(var s in segments) {
            Require(!existing.Any(x=>x.Start < s.End && x.End > s.Start),"时间段与已有记录重叠，请先调整记录");
            Require(!rows.Any(x=>x.State=="Running" && x.ActiveSince < s.End),"时间段与正在运行的计时器冲突");
        }
    }
    public async Task<object> TimeSaveActivity(string user, TimeActivityInput b, string? id, string? version)
    {
        Require(!string.IsNullOrWhiteSpace(b.Title) && b.Title.Length<=200 && (b.Note??"").Length<=2000,"请检查活动标题和备注长度");
        TimeCategory(b.Category); await TimeProjectCheck(user,b.ProjectId);
        var a=id==null?new TimeActivity{UserId=user}:await TimeOwned<TimeActivity>(user,id);
        if(id!=null){Version(a,version);Require(a.State=="Completed","请先停止计时再编辑");a.Version++;}
        var segments=b.Segments??[new TimeSegment(b.Start,b.End)];await TimeNoOverlap(user,segments,id);
        a.Title=b.Title.Trim();a.Category=b.Category;a.Note=b.Note??"";a.ProjectId=b.ProjectId;a.SegmentsJson=JsonSerializer.Serialize(segments.OrderBy(s=>s.Start),Json);
        if(id==null)db.Add(a);return new{a.Id};
    }
    public async Task<object> TimeBatch(string user, TimeActivityInput[] rows)
    {
        Require(rows.Length is >0 and <=100,"每批支持1至100条记录");
        var ordered=rows.SelectMany(x=>x.Segments??[new TimeSegment(x.Start,x.End)]).OrderBy(x=>x.Start).ToArray();for(int i=1;i<ordered.Length;i++)Require(ordered[i].Start>=ordered[i-1].End,"批次内记录不能重叠");
        var ids=new List<object>();foreach(var row in rows)ids.Add(await TimeSaveActivity(user,row,null,null));return new{items=ids};
    }
    public async Task<object> TimeTimer(string user, TimeTimerInput? b, string? id, string action, string? version)
    {
        var now=DateTimeOffset.UtcNow;
        if(id==null){Require(b!=null && !string.IsNullOrWhiteSpace(b.Title) && b.Title.Length<=200,"请填写活动标题");TimeCategory(b!.Category);await TimeProjectCheck(user,b.ProjectId);
            Require(!await db.Set<TimeActivity>().AnyAsync(x=>x.UserId==user&&x.State!="Completed"),"请先停止已有计时器");
            var a=new TimeActivity{UserId=user,Title=b.Title.Trim(),Category=b.Category,ProjectId=b.ProjectId,State="Running",ActiveSince=now};db.Add(a);return new{a.Id};}
        var item=await TimeOwned<TimeActivity>(user,id);Version(item,version);
        Require(action is "pause" or "resume" or "stop","计时动作无效");
        if(action=="resume") {Require(item.State=="Paused","只有暂停的计时器可以继续");Require(!await db.Set<TimeActivity>().AnyAsync(x=>x.UserId==user&&x.State=="Running"),"已有运行中的计时器");item.ActiveSince=now;item.State="Running";}
        else {Require(item.State=="Running" || action=="stop"&&item.State=="Paused","计时状态不支持此操作");
            if(item.State=="Running") {var segments=TimeSegments(item,now);item.SegmentsJson=JsonSerializer.Serialize(segments,Json);}
            item.ActiveSince=null;item.State=action=="stop"?"Completed":"Paused";}
        item.Version++;return new{item.Id};
    }
    public async Task<object> TimeDelete(string user,string kind,string id,string? version)
    {
        Owned row=kind switch {"activities"=>await TimeOwned<TimeActivity>(user,id),"budgets"=>await TimeOwned<TimeBudget>(user,id),"templates"=>await TimeOwned<TimeTemplate>(user,id),"projects"=>await TimeOwned<TimeProject>(user,id),"links"=>await TimeOwned<TimeFinanceLink>(user,id),_=>throw new ApiException(422,"不支持删除此类型")};Version(row,version);
        if(kind=="projects")Require(!await db.Set<TimeActivity>().AnyAsync(x=>x.UserId==user&&x.ProjectId==id)&&!await db.Set<TimeFinanceLink>().AnyAsync(x=>x.UserId==user&&x.ProjectId==id)&&!await db.Set<TimeTemplate>().AnyAsync(x=>x.UserId==user&&x.ProjectId==id),"请先解除项目关联，或将项目归档");
        if(kind=="activities")db.RemoveRange(await db.Set<TimeFinanceLink>().Where(x=>x.UserId==user&&x.ActivityId==id).ToArrayAsync());
        db.Remove(row);return new{deleted=true};
    }
    public async Task<object> TimeSaveValuation(string user,TimeValuationInput b)
    {
        Require(CurrencyDefinitions.Supports(b.Currency)&&b.EffectiveFrom.Year is >=1901 and <=9997,"币种或生效日期无效");await RequireEnabledCurrency(user,b.Currency);
        Require(!string.IsNullOrWhiteSpace(b.Source)&&b.Source.Length<=500,"请注明估值来源，最多500字");
        Require(b.Income>=0&&b.Income<=1000000000000&&b.Hours>=0&&b.Hours<=1000000,"估值输入超出范围");
        var rate=TimeAssetMath.Rate(b.Method,b.Income,b.Hours,b.HourlyRate);
        var revision=(await db.Set<TimeValuation>().Where(x=>x.UserId==user).MaxAsync(x=>(int?)x.Revision)??0)+1;
        var v=new TimeValuation{UserId=user,Method=b.Method,Source=b.Source.Trim(),Currency=b.Currency,EffectiveFrom=b.EffectiveFrom,Income=b.Income,Hours=b.Hours,HourlyRate=rate,Revision=revision};db.Add(v);return new{v.Id,revision};
    }
    public async Task<object> TimeSaveBudget(string user,TimeBudgetInput b,string? id,string? version)
    {
        Require(b.StartDate.Year is >=1901 and <=9996,"预算日期范围无效");var end=TimeAssetMath.BudgetEnd(b.Period,b.StartDate);Require(b.Minutes>0&&b.Minutes<=(end.DayNumber-b.StartDate.DayNumber)*1440,"时间预算范围无效");if(b.Category!=null)TimeCategory(b.Category);
        Require(!await db.Set<TimeBudget>().AnyAsync(x=>x.UserId==user&&x.Id!=id&&x.Period==b.Period&&x.StartDate==b.StartDate&&x.Category==b.Category),"该期间及分类已有预算");
        var row=id==null?new TimeBudget{UserId=user}:await TimeOwned<TimeBudget>(user,id);if(id!=null){Version(row,version);row.Version++;}row.Period=b.Period;row.StartDate=b.StartDate;row.Category=b.Category;row.Minutes=b.Minutes;if(id==null)db.Add(row);return new{row.Id};
    }
    public async Task<object> TimeSaveTemplate(string user,TimeTemplateInput b,string? id,string? version)
    {
        Require(!string.IsNullOrWhiteSpace(b.Name)&&b.Name.Length<=200&&b.Minutes is >0 and <=1440&&b.Repeat is "Daily" or "Weekdays" or "Weekly","模板信息无效");TimeCategory(b.Category);await TimeProjectCheck(user,b.ProjectId);
        var row=id==null?new TimeTemplate{UserId=user}:await TimeOwned<TimeTemplate>(user,id);if(id!=null){Version(row,version);row.Version++;}row.Name=b.Name.Trim();row.Category=b.Category;row.Minutes=b.Minutes;row.ProjectId=b.ProjectId;row.Repeat=b.Repeat;if(id==null)db.Add(row);return new{row.Id};
    }
    public async Task<object> TimeApplyTemplate(string user,string id,DateTimeOffset start,int count)
    {
        Require(count is >0 and <=31 && start.Year is >=1901 and <=9996,"每次生成1至31条活动，起始年份须有效");var t=await TimeOwned<TimeTemplate>(user,id);var rows=new List<TimeActivityInput>();var cursor=start;
        while(rows.Count<count){if(t.Repeat!="Weekdays"||cursor.ToOffset(TimeSpan.FromHours(8)).DayOfWeek is not (DayOfWeek.Saturday or DayOfWeek.Sunday))rows.Add(new(t.Name,t.Category,cursor,cursor.AddMinutes(t.Minutes),ProjectId:t.ProjectId));cursor=cursor.AddDays(t.Repeat=="Weekly"?7:1);}
        return await TimeBatch(user,rows.ToArray());
    }
    public async Task<object> TimeSaveProject(string user,TimeProjectInput b,string? id,string? version)
    {
        Require(!string.IsNullOrWhiteSpace(b.Name)&&b.Name.Length<=200&&(b.Goal??"").Length<=2000&&(b.ReturnUnit??"").Length<=100&&b.BudgetMinutes>0&&b.BudgetMinutes<=100000000&&b.TargetReturn>0&&b.TargetReturn<=1000000000000&&b.ActualReturn>=0&&b.ActualReturn<=1000000000000&&b.State is "Active" or "Completed" or "Archived","项目信息或目标无效");
        var row=id==null?new TimeProject{UserId=user}:await TimeOwned<TimeProject>(user,id);if(id!=null){Version(row,version);row.Version++;}row.Name=b.Name.Trim();row.Goal=b.Goal??"";row.BudgetMinutes=b.BudgetMinutes;row.ReturnUnit=b.ReturnUnit??"";row.TargetReturn=b.TargetReturn;row.ActualReturn=b.ActualReturn;row.State=b.State;if(id==null)db.Add(row);return new{row.Id};
    }
    public async Task<object> TimeLink(string user,TimeLinkInput b)
    {
        Require((b.ActivityId!=null) != (b.ProjectId!=null),"请选择一个关联活动或项目");
        if(b.ActivityId!=null)await TimeOwned<TimeActivity>(user,b.ActivityId);await TimeProjectCheck(user,b.ProjectId);
        Require(await db.Transactions.AnyAsync(x=>x.UserId==user&&x.Id==b.TransactionId&&x.Status!="Deleted"),"财务流水不存在");
        Require(!await db.Set<TimeFinanceLink>().AnyAsync(x=>x.UserId==user&&x.TransactionId==b.TransactionId&&x.ActivityId==b.ActivityId&&x.ProjectId==b.ProjectId),"该流水已关联");
        var row=new TimeFinanceLink{UserId=user,TransactionId=b.TransactionId,ActivityId=b.ActivityId,ProjectId=b.ProjectId};db.Add(row);return new{row.Id};
    }
}
