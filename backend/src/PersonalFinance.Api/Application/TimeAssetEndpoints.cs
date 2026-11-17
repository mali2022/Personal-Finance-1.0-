using System.Text.Json;
using System.Text.Json.Nodes;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public static class TimeAssetEndpoints
{
    public sealed record TemplateApply([property:System.Text.Json.Serialization.JsonConverter(typeof(TimeOffsetConverter))] DateTimeOffset Start,int Count=1);
    public sealed record AnalysisInput(DateOnly From,DateOnly To,string Currency,string Mode,bool SendTimeSummary,decimal ScenarioHours=0,string? ProjectId=null);
    public static void Map(RouteGroupBuilder api)
    {
        var r=api.MapGroup("/time-assets");
        r.MapGet("/catalog",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.TimeCatalog(FinanceEndpoints.User(c))));
        r.MapGet("/report",async(DateOnly from,DateOnly to,string currency,string? projectId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.TimeReport(FinanceEndpoints.User(c),from,to,currency,projectId)));
        r.MapPost("/activities",async(TimeActivityInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveActivity(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/activities/{id}",async(string id,TimeActivityInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveActivity(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/batch",async(TimeActivityInput[] b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeBatch(FinanceEndpoints.User(c),b),true));
        r.MapPost("/timer",async(TimeTimerInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeTimer(FinanceEndpoints.User(c),b,null,"start",null),true));
        r.MapPost("/timer/{id}/{action}",async(string id,string action,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id,action},async()=>await f.TimeTimer(FinanceEndpoints.User(c),null,id,action,c.Request.Headers.IfMatch),true));
        r.MapPost("/valuations",async(TimeValuationInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveValuation(FinanceEndpoints.User(c),b),true));
        r.MapPost("/budgets",async(TimeBudgetInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveBudget(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/budgets/{id}",async(string id,TimeBudgetInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveBudget(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/templates",async(TimeTemplateInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveTemplate(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/templates/{id}",async(string id,TimeTemplateInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveTemplate(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/templates/{id}/apply",async(string id,TemplateApply b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeApplyTemplate(FinanceEndpoints.User(c),id,b.Start,b.Count),true));
        r.MapPost("/projects",async(TimeProjectInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveProject(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/projects/{id}",async(string id,TimeProjectInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeSaveProject(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/links",async(TimeLinkInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.TimeLink(FinanceEndpoints.User(c),b),true));
        // POST deletion works with the existing recoverable-operation journal.
        r.MapPost("/{kind}/{id}/delete",async(string kind,string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{kind,id},async()=>await f.TimeDelete(FinanceEndpoints.User(c),kind,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/analysis",async(AnalysisInput b,FinanceService f,AiPrivacyService privacy,IAiProvider provider,HttpContext c)=>{
            FinanceService.Require(b.Mode is "distribution" or "finance" or "budget" or "project" or "scenario","分析类型无效");
            FinanceService.Require(b.SendTimeSummary,"请确认向 DeepSeek 发送时间统计摘要");
            FinanceService.Require(b.ScenarioHours is >=0 and <=8760,"情景时数无效");
            var user=FinanceEndpoints.User(c);var consent=await privacy.Require(user,c.RequestAborted);FinanceService.Require(consent.AllowSummary,"请先在 AI 与隐私设置授权汇总数据");
            var report=JsonSerializer.SerializeToNode(await f.TimeReport(user,b.From,b.To,b.Currency,b.ProjectId),FinanceService.Json)!.AsObject();
            var summary=report["summary"]!.DeepClone();
            // Do not send transaction IDs, activity names/notes, project names or source documents.
            if(b.Mode!="finance")foreach(var name in new[]{"linkedIncome","linkedExpense","combinedResourceCost","actualWorkHourlyRate"})summary.AsObject().Remove(name);
            var hours=report["summary"]!["recordedSeconds"]!.GetValue<decimal>()/3600;
            var cost=report["summary"]!["referenceCost"]?.GetValue<decimal>();
            var scenario=new{hours=b.ScenarioHours,referenceCost=hours>0?cost/hours*b.ScenarioHours:null,method="Selected-period weighted reference rate; hypothetical only, not a forecast or a ledger transaction"};
            var budgetEvidence=report["budgets"]!.AsArray().Select((x,i)=>new{index=i+1,category=x!["category"]?.GetValue<string>(),minutes=x["minutes"]!.GetValue<int>(),usedMinutes=x["usedMinutes"]!.GetValue<decimal>(),overMinutes=x["overMinutes"]!.GetValue<decimal>()}).ToArray();
            var projectEvidence=report["projects"]!.AsArray().Select((x,i)=>new{index=i+1,budgetMinutes=x!["budgetMinutes"]!.GetValue<int>(),minutes=x["minutes"]!.GetValue<decimal>(),target=x["targetReturn"]!.GetValue<decimal>(),actual=x["actualReturn"]!.GetValue<decimal>()}).ToArray();
            var evidence=new{b.From,b.To,b.Currency,b.Mode,summary,categories=report["categories"]!.DeepClone(),budgets=b.Mode=="budget"?budgetEvidence:null,projects=b.Mode=="project"?projectEvidence:null,scenario,definitions=report["definitions"]!.DeepClone()};
            var completion=await provider.Complete(user,new JsonArray(new JsonObject{["role"]="system",["content"]="You explain deterministic time asset statistics. Only supplied evidence is factual. Never invent activity records, payroll, returns, numerical forecasts or missing rates. Do not treat unrecorded time as inefficient. Explain denominators, coverage and uncertainty. Suggestions are optional and do not change records. Any scenario is hypothetical. Reply in the user's language (Chinese by default)."},new JsonObject{["role"]="user",["content"]=JsonSerializer.Serialize(evidence,FinanceService.Json)}),null,"time-assets-analysis",c.RequestAborted);
            var current=await privacy.Require(user,c.RequestAborted);if(current.ConsentVersion!=consent.ConsentVersion||!current.AllowSummary)throw new ApiException(409,"AI授权已变更，请重新分析");
            return FinanceEndpoints.Ok(c,new{explanation=completion.Message["content"]?.GetValue<string>()??"",evidence});
        }).RequireRateLimiting("ai");
    }
}
