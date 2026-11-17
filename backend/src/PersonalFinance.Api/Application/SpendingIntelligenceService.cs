using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record ValueWeightRequest(decimal[] Weights);
public sealed record ValueOptimizeRequest(ValueProblem Problem, string? SourceRunId = null);
public sealed record ValueRun(ValueProblem Problem, ValueSolution Solution, DateTimeOffset CalculatedAt, string? SourceRunId);
public sealed record ValuePreferences(bool Enabled, string[] Dimensions, decimal[] ManualWeights);
public sealed record ValueFeedback(string RunId, string PlanId, string[] PurchaseTransactionIds, string[] AdditionalTransactionIds,
    int? ActualUses, decimal? ActualHours, decimal? Satisfaction, bool? WorthIt, bool? WouldRepeat, string GoalProgress,
    string Notes, bool UseForLearning, decimal[]? ExplicitPreferenceWeights = null, decimal?[]? ActualValueScores = null);
public sealed partial class FinanceService
{
    const string ValueRunKind="SpendingOptimization", ValuePreferenceKind="SpendingPreference", ValueFeedbackKind="SpendingFeedback";
    static T ValueRead<T>(StoredDocument d) => JsonSerializer.Deserialize<T>(d.Content,Json)!;
    void ValueAudit(string user,string id,string action) => db.Add(new AuditRecord{UserId=user,ResourceId=id,ResourceType="SpendingValueV2",Action=action,ChangesJson="{}"});
    public async Task<ValueRun> ValueRunInput(string user,string id) => ValueRead<ValueRun>(await Document(user,id,ValueRunKind));
    public async Task<object> ValueSaveRun(string user,ValueOptimizeRequest request,ValueSolution solution)
    {
        var traces=request.Problem.Candidates.Select(c=>c.IdeaTraceId).OfType<string>().Distinct().ToArray();
        Require(traces.Length==0||await db.Documents.CountAsync(d=>d.UserId==user&&d.Kind=="SpendingDesignerTrace"&&traces.Contains(d.Id))==traces.Length,"AI来源记录不存在或无权访问");
        string? lineage=null;
        if(request.SourceRunId!=null){var source=await ValueRunInput(user,request.SourceRunId);lineage=source.SourceRunId??request.SourceRunId;}
        var d=new StoredDocument{UserId=user,Kind=ValueRunKind,Name="Optimization "+request.Problem.Start,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new ValueRun(request.Problem,solution,DateTimeOffset.UtcNow,lineage),Json)};
        db.Add(d);ValueAudit(user,d.Id,"Optimize");return new{d.Id,version=d.Version.ToString(),run=ValueRead<ValueRun>(d)};
    }
    public async Task<object> ValueRuns(string user,IQueryCollection query)
    {
        var(page,size)=Paging(query);var q=db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==ValueRunKind);
        return new{items=await q.OrderByDescending(d=>d.CreatedAt).ThenBy(d=>d.Id).Skip((page-1)*size).Take(size).Select(d=>new{d.Id,d.Name,d.CreatedAt}).ToArrayAsync(),total=await q.CountAsync(),page,pageSize=size};
    }
    public async Task<ValueRun> ValueReweight(string user,string id,decimal[] weights)
    {
        var run=await ValueRunInput(user,id);var p=run.Problem with{Weights=weights};SpendingOptimizer.Validate(p);
        var plans=run.Solution.Plans.Select(plan=>plan with{Preference=SpendingMultiObjective.Preference(plan.Scores,weights)}).OrderByDescending(plan=>plan.Feasible).ThenByDescending(plan=>plan.Feasible?plan.Preference:decimal.MinValue).ThenBy(plan=>plan.TotalCost).ThenBy(plan=>plan.Id,StringComparer.Ordinal).ToArray();
        return run with{Problem=p,Solution=run.Solution with{Plans=plans}};
    }
    public async Task<object> ValueRunDetail(string user,string id)
    {var d=await Document(user,id,ValueRunKind);return new{d.Id,version=d.Version.ToString(),run=ValueRead<ValueRun>(d)};}
    public async Task<object> ValuePreferenceView(string user)
    {
        var doc=await db.Documents.AsNoTracking().SingleOrDefaultAsync(d=>d.UserId==user&&d.Kind==ValuePreferenceKind);
        var p=doc==null?new ValuePreferences(false,[],[]):ValueRead<ValuePreferences>(doc);
        // Bounded feedback history. Never inspect spending history to infer interests.
        var docs=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==ValueFeedbackKind).OrderByDescending(d=>d.CreatedAt).ThenBy(d=>d.Id).Take(200).ToArrayAsync();
        var evidence=docs.Select(d=>new{d.Id,version=d.Version.ToString(),d.CreatedAt,feedback=ValueRead<ValueFeedback>(d)}).ToArray();
        var matching=evidence.Where(e=>e.feedback.UseForLearning&&e.feedback.ExplicitPreferenceWeights?.Length==p.Dimensions.Length).ToArray();
        // Ignore feedback whose archived dimension names differ, even when lengths match.
        var runIds=matching.Select(e=>e.feedback.RunId).Distinct().ToArray();
        var runs=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==ValueRunKind&&runIds.Contains(d.Id)).ToArrayAsync();
        var allowed=runs.Where(d=>ValueRead<ValueRun>(d).Problem.Dimensions.SequenceEqual(p.Dimensions)).Select(d=>d.Id).ToHashSet();
        matching=matching.Where(e=>allowed.Contains(e.feedback.RunId)).GroupBy(e=>ValueRead<ValueRun>(runs.Single(d=>d.Id==e.feedback.RunId)).SourceRunId??e.feedback.RunId).Select(g=>g.First()).ToArray();
        decimal[] Normalize(decimal[] values){var sum=values.Sum();return sum==0?values:values.Select(v=>v/sum).ToArray();}
        var manual=Normalize(p.ManualWeights);var suggested=manual;
        if(matching.Length>=3)suggested=manual.Select((w,i)=>.8m*w+.2m*matching.Average(e=>Normalize(e.feedback.ExplicitPreferenceWeights!)[i])).ToArray();
        return new{version=doc?.Version.ToString()??"0",settings=p,suggestedWeights=suggested,coldStart=matching.Length<3,eligibleFeedback=matching.Length,learningVersion="transparent-80-20-v1",evidence,
            explanation="Explicit user importance weights only; at least 3 independent decisions; 80% manual + 20% mean explicit feedback. Latest 200 feedback records; no expense-based inference. Pausing rejects new learning contributions."};
    }
    public async Task<object> ValueSavePreferences(string user,ValuePreferences p,string? version,bool reset=false)
    {
        Require(p.Dimensions.Length is >0 and <=12 && p.Dimensions.All(s=>!string.IsNullOrWhiteSpace(s)&&s.Length<=50)&&p.Dimensions.Distinct().Count()==p.Dimensions.Length&&p.ManualWeights.Length==p.Dimensions.Length&&p.ManualWeights.All(w=>w is >=0 and <=1000000)&&p.ManualWeights.Sum()>0,"偏好维度与权重无效");
        var d=await db.Documents.SingleOrDefaultAsync(d=>d.UserId==user&&d.Kind==ValuePreferenceKind);
        if(d==null){Require(version=="0","偏好版本冲突");d=new StoredDocument{UserId=user,Kind=ValuePreferenceKind,Name="Preference",ContentType="application/json"};db.Add(d);}else{Version(d,version);d.Version++;}
        if(reset){var feedback=await db.Documents.Where(d=>d.UserId==user&&d.Kind==ValueFeedbackKind).ToArrayAsync();foreach(var item in feedback){var old=ValueRead<ValueFeedback>(item);item.Content=JsonSerializer.SerializeToUtf8Bytes(old with{UseForLearning=false,ExplicitPreferenceWeights=null},Json);item.Version++;}p=p with{Enabled=false};}
        d.Content=JsonSerializer.SerializeToUtf8Bytes(p,Json);ValueAudit(user,d.Id,reset?"ResetPreferences":"UpdatePreferences");return new{d.Id,version=d.Version.ToString(),settings=p};
    }
    public async Task<object> ValueSaveFeedback(string user,string? id,ValueFeedback feedback,string? version)
    {
        var run=await ValueRunInput(user,feedback.RunId);Require(run.Solution.Plans.Any(p=>p.Id==feedback.PlanId&&p.Feasible),"请选择真实保存的可行方案");
        Require(feedback.ActualUses is null or >=0 && feedback.ActualHours is null or >=0 and <=1000000 && feedback.Satisfaction is null or >=0 and <=10 && feedback.GoalProgress.Length<=1000&&feedback.Notes.Length<=2000,"复盘参数无效");
        if(feedback.ActualValueScores is decimal?[] values)Require(values.Length==run.Problem.Dimensions.Length&&values.All(v=>v is null or >=0 and <=10),"实际价值评分无效");
        var ids=feedback.PurchaseTransactionIds.Concat(feedback.AdditionalTransactionIds).ToArray();
        Require(ids.Length<=100&&ids.Distinct().Count()==ids.Length&&await db.Transactions.CountAsync(t=>t.UserId==user&&ids.Contains(t.Id)&&t.Currency==run.Problem.Currency&&t.Status=="Confirmed"&&t.Type=="Expense")==ids.Length,"关联支出无效或不属于本人");
        if(feedback.ExplicitPreferenceWeights is decimal[] w)Require(w.Length==run.Problem.Dimensions.Length&&w.All(v=>v is >=0 and <=1000000)&&w.Sum()>0,"反馈偏好权重无效");
        var allFeedback=await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind==ValueFeedbackKind).ToArrayAsync();
        Require(allFeedback.Length<200||id!=null,"复盘达到200条上限，请更新已有记录");
        if(feedback.UseForLearning)
        {
            var pref=await db.Documents.AsNoTracking().SingleOrDefaultAsync(d=>d.UserId==user&&d.Kind==ValuePreferenceKind);
            Require(pref!=null&&ValueRead<ValuePreferences>(pref).Enabled&&feedback.ExplicitPreferenceWeights!=null,"请先主动启用偏好学习并明确填写反馈权重");
            var all=allFeedback;
            Require(all.Length<200||id!=null,"学习反馈最多200条，请先撤销不需要的反馈");
            Require(!all.Any(d=>d.Id!=id&&ValueRead<ValueFeedback>(d).RunId==feedback.RunId&&ValueRead<ValueFeedback>(d).UseForLearning),"同一决策只能贡献一条学习反馈");
        }
        var doc=id==null?new StoredDocument{UserId=user,Kind=ValueFeedbackKind,Name="Consumption review",ContentType="application/json"}:await Document(user,id,ValueFeedbackKind);
        if(id==null){Require(version=="0","新反馈版本应为0");db.Add(doc);}else{Version(doc,version);doc.Version++;}
        doc.Content=JsonSerializer.SerializeToUtf8Bytes(feedback,Json);ValueAudit(user,doc.Id,id==null?"Feedback":"UpdateFeedback");return new{doc.Id,version=doc.Version.ToString()};
    }
    public async Task<object> ValueFeedbackDetail(string user,string id)
    {
        var doc=await Document(user,id,ValueFeedbackKind);var f=ValueRead<ValueFeedback>(doc);var run=await ValueRunInput(user,f.RunId);var plan=run.Solution.Plans.Single(p=>p.Id==f.PlanId);
        var ids=f.PurchaseTransactionIds.Concat(f.AdditionalTransactionIds).ToArray();
        var tx=await db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&ids.Contains(t.Id)&&t.Type=="Expense"&&t.Currency==run.Problem.Currency&&t.Status=="Confirmed").Select(t=>new{t.Id,t.Amount}).ToArrayAsync();
        var missing=ids.Except(tx.Select(t=>t.Id)).ToArray();decimal? cost=ids.Length==0||missing.Length>0?null:tx.Sum(t=>t.Amount);
        return new{doc.Id,version=doc.Version.ToString(),feedback=f,actualCost=cost,actualAdditionalCost=f.AdditionalTransactionIds.Length==0?(decimal?)null:missing.Intersect(f.AdditionalTransactionIds).Any()?null:tx.Where(t=>f.AdditionalTransactionIds.Contains(t.Id)).Sum(t=>t.Amount),actualCostPerUse=f.ActualUses>0&&plan.Allocations.Length==1?cost/f.ActualUses:null,actualHours=f.ActualHours,expectedCost=plan.TotalCost,costDeviation=cost-plan.TotalCost,budgetDeviation=cost-run.Problem.Budget,missing,expectedScores=plan.Scores,actualSatisfaction=f.Satisfaction,actualValueScores=f.ActualValueScores,subjectiveDeviations=f.ActualValueScores?.Select((v,i)=>v-plan.Scores[i]).ToArray(),expectedUses=plan.Allocations.Length==1?plan.Allocations[0].Uses:null,usageDeviation=plan.Allocations.Length==1?f.ActualUses-plan.Allocations[0].Uses:null};
    }
    public async Task<object> ValueRevokeFeedback(string user,string id,string? version)
    {var d=await Document(user,id,ValueFeedbackKind);Version(d,version);var feedback=ValueRead<ValueFeedback>(d);d.Content=JsonSerializer.SerializeToUtf8Bytes(feedback with{UseForLearning=false,ExplicitPreferenceWeights=null},Json);d.Version++;ValueAudit(user,id,"RevokeFeedback");return new{id,version=d.Version.ToString()};}
}
public static class SpendingIntelligenceEndpoints
{
    static IResult Invalid(Exception e) => throw new ApiException(e is TimeoutException?408:422,e.Message,e is TimeoutException?"OPTIMIZATION_TIMEOUT":"OPTIMIZATION_INVALID");
    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/spending-value/runs/{id}/weights",async(string id,ValueWeightRequest b,FinanceService f,HttpContext c)=>{try{return FinanceEndpoints.Ok(c,await f.ValueReweight(FinanceEndpoints.User(c),id,b.Weights));}catch(ArgumentException e){return Invalid(e);}});
        api.MapPost("/spending-value/uncertainty",async(ValueSensitivityRequest b,HttpContext c)=>{try{return FinanceEndpoints.Ok(c,await SpendingCompute.Run(()=>SpendingUncertainty.Analyze(b,c.RequestAborted),c.RequestAborted));}catch(Exception e)when(e is ArgumentException or TimeoutException){return Invalid(e);}});
        api.MapPost("/spending-value/optimize",async(ValueOptimizeRequest b,FinanceService f,HttpContext c)=>{
            ValueSolution solution;try{solution=await SpendingCompute.Run(()=>SpendingOptimizer.Solve(b.Problem,c.RequestAborted),c.RequestAborted);}catch(Exception e)when(e is ArgumentException or TimeoutException){return Invalid(e);}
            return await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSaveRun(FinanceEndpoints.User(c),b,solution),true);
        });
        api.MapGet("/spending-value/runs",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ValueRuns(FinanceEndpoints.User(c),c.Request.Query)));
        api.MapGet("/spending-value/runs/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ValueRunDetail(FinanceEndpoints.User(c),id)));
        api.MapPost("/spending-value/runs/{id}/reevaluate",async(string id,ValueOptimizeRequest b,FinanceService f,HttpContext c)=>{
            await f.ValueRunInput(FinanceEndpoints.User(c),id);ValueSolution solution;try{solution=await Task.Run(()=>SpendingOptimizer.Solve(b.Problem,c.RequestAborted),c.RequestAborted);}catch(Exception e)when(e is ArgumentException or TimeoutException){return Invalid(e);}
            return await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSaveRun(FinanceEndpoints.User(c),b with{SourceRunId=id},solution),true);
        });
        api.MapGet("/spending-value/preferences",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ValuePreferenceView(FinanceEndpoints.User(c))));
        api.MapPut("/spending-value/preferences",async(ValuePreferences b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSavePreferences(FinanceEndpoints.User(c),b,c.Request.Headers.IfMatch),true));
        api.MapPost("/spending-value/preferences/reset",async(ValuePreferences b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSavePreferences(FinanceEndpoints.User(c),b,c.Request.Headers.IfMatch,true),true));
        api.MapPost("/spending-value/feedback",async(ValueFeedback b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSaveFeedback(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
        api.MapPut("/spending-value/feedback/{id}",async(string id,ValueFeedback b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ValueSaveFeedback(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/spending-value/feedback/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ValueFeedbackDetail(FinanceEndpoints.User(c),id)));
        api.MapPost("/spending-value/feedback/{id}/revoke",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.ValueRevokeFeedback(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        SpendingDesignerEndpoint.Map(api);
        SpendingExplanationEndpoint.Map(api);
    }
}
