using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record StatementTaskInput(string AccountId, DateTimeOffset StartsAt, DateTimeOffset EndsAt);
public sealed record StatementTaskRun(string Version,bool AutoConfirm=false,string? PreviewToken=null,bool CompactResults=false);
public sealed record StatementBatchItem(string Id, string Version, string? TransactionId = null, string? TransactionVersion = null);
public sealed record StatementBatchInput(string Action, string Reason, StatementBatchItem[] Items);

public sealed partial class FinanceService
{
    private Task<StatementRecord[]> StatementTaskRows(string user,StatementTask task){
        var q=db.Set<StatementRecord>().Where(x=>x.UserId==user&&x.AccountId==task.AccountId&&x.State=="Pending"&&x.CreatedAt<=task.CreatedAt&&x.OccurredAt>=task.StartsAt&&x.OccurredAt<=task.EndsAt);
        if(task.CursorDate!=null)q=q.Where(x=>x.OccurredAt>task.CursorDate||x.OccurredAt==task.CursorDate&&string.Compare(x.Id,task.Cursor)>0);
        return q.OrderBy(x=>x.OccurredAt).ThenBy(x=>x.Id).Take(20).ToArrayAsync();
    }
    public async Task<object> StatementTaskCreate(string user, StatementTaskInput b) {
        await Account(user,b.AccountId,false); Require(b.EndsAt>=b.StartsAt && b.EndsAt-b.StartsAt<=TimeSpan.FromDays(366),"任务期间最多366天");
        Require(await db.Set<StatementTask>().CountAsync(x=>x.UserId==user&&x.AccountId==b.AccountId&&(x.State=="Pending"||x.State=="Running"))<10,"每账户最多10个未完成建议任务");
        var total=await db.Set<StatementRecord>().Where(x=>x.UserId==user&&x.AccountId==b.AccountId&&x.State=="Pending"&&x.OccurredAt>=b.StartsAt&&x.OccurredAt<=b.EndsAt).Take(10001).CountAsync();Require(total<=10000,"每任务最多10000条，请缩小期间范围");
        var task=new StatementTask { UserId=user,AccountId=b.AccountId,StartsAt=b.StartsAt,EndsAt=b.EndsAt,Total=total }; db.Add(task);return new {task.Id,task.State,task.Total,version=task.Version.ToString()};
    }
    public async Task<object> StatementTasks(string user,string accountId) {
        await Account(user,accountId,false);
        return await db.Set<StatementTask>().AsNoTracking().Where(x=>x.UserId==user&&x.AccountId==accountId).OrderByDescending(x=>x.CreatedAt).Take(20).Select(x=>new{x.Id,x.State,x.StartsAt,x.EndsAt,total=x.Total==0&&x.Processed>0?(int?)null:x.Total,x.Processed,x.Failed,x.CreatedAt,version=x.Version.ToString()}).ToArrayAsync();
    }
    public async Task<object> StatementTaskStep(string user,string id,StatementTaskRun b) {
        var task=await db.Set<StatementTask>().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"任务不存在"); Version(task,b.Version);await Account(user,task.AccountId,false);
        Require(task.State!="Completed","任务已完成");
        var rows=await StatementTaskRows(user,task);StatementAutoProposal[] automatic=[];
        if(b.AutoConfirm){var plan=await StatementAutomaticPlan(user,task);Require(b.PreviewToken==plan.Token,"自动确认影响已变化，请重新预览");rows=plan.Rows;automatic=plan.Proposals;}
        var results=new List<object>();var failedBefore=task.Failed;
        foreach(var row in rows) {
            try {
                var candidateResult=await StatementCandidates(user,row.Id);var proposal=automatic.SingleOrDefault(x=>x.StatementId==row.Id);var autoConfirmed=false;
                if(proposal?.Eligible==true){
                    var sourceJob=await db.Imports.AsNoTracking().SingleAsync(j=>j.UserId==user&&j.Id==row.ImportJobId);var approval=StatementApproval(user,row.AccountId,sourceJob);
                    Require(approval!=null&&Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(JsonSerializer.Serialize(approval,Json))))==proposal.ApprovalFingerprint,"来源核准已变化或过期，请重新预览");
                    await ConfirmStatement(user,row.Id,new(proposal.TransactionId!,proposal.StatementVersion,proposal.TransactionVersion!,"Server-approved source and automatic rule "+proposal.RuleId));var link=db.Set<StatementLink>().Local.Single(l=>l.StatementRecordId==row.Id&&l.State=="Confirmed");link.ConfirmationMode="RuleAutomatic";
                    var evidence=System.Text.Json.Nodes.JsonNode.Parse(link.EvidenceJson)!.AsObject();evidence["sourceApproval"]=JsonSerializer.SerializeToNode(new{sourceJob.SourceHash,mappingHash=StatementMappingHash(sourceJob),approval!.ExpiresAt,approval.ApprovedBy,proposal.ApprovalFingerprint},Json);link.EvidenceJson=evidence.ToJsonString();autoConfirmed=true;
                }
                results.Add(new {row.Id, result=candidateResult,autoConfirmed,automaticReasons=proposal?.Reasons??[]});
            }
            catch(ApiException e) {task.Failed++;results.Add(new{row.Id,error=e.Message});}
            task.Processed++;task.Cursor=row.Id;task.CursorDate=row.OccurredAt;
        }
        // Each committed step replaces the bounded result window; cursors survive process restarts.
        task.State=rows.Length<20?"Completed":"Running";task.Version++;
        var snapshots=new List<object>();
        foreach(var result in results){var node=JsonSerializer.SerializeToElement(result,Json);var statementId=node.GetProperty("id").GetString();if(node.TryGetProperty("error",out var error)){snapshots.Add(new{statementId,error=error.GetString()});continue;}var details=node.GetProperty("result");snapshots.Add(new{statementId,statementVersion=details.GetProperty("statement").GetProperty("version").GetString(),generatedAt=details.GetProperty("generatedAt"),candidateCount=details.GetProperty("candidates").GetArrayLength(),candidates=details.GetProperty("candidates").EnumerateArray().Take(5).Select(x=>x.Clone()).ToArray(),truncated=details.GetProperty("truncated"),competing=details.GetProperty("competing"),autoConfirmed=node.GetProperty("autoConfirmed"),automaticReasons=node.GetProperty("automaticReasons")});}
        db.Add(new StatementTaskStep{UserId=user,StatementTaskId=task.Id,Sequence=checked((int)task.Version-1),Processed=rows.Length,Failed=task.Failed-failedBefore,ResultsJson=JsonSerializer.Serialize(snapshots,Json)});
        task.ResultsJson=JsonSerializer.Serialize(snapshots,Json);
        return new {task.Id,task.State,task.Processed,task.Failed,version=task.Version.ToString(),results=b.CompactResults?snapshots:results};
    }
    public async Task<object> StatementTaskHistory(string user,string id,IQueryCollection p){
        var task=await db.Set<StatementTask>().AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id)??throw new ApiException(404,"任务不存在");await Account(user,task.AccountId,false);var(page,size)=Paging(p);
        var q=db.Set<StatementTaskStep>().AsNoTracking().Where(x=>x.UserId==user&&x.StatementTaskId==id);var total=await q.CountAsync();var steps=await q.OrderBy(x=>x.Sequence).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{total,page,pageSize=size,items=steps.Select(x=>new{x.Id,x.Sequence,x.Processed,x.Failed,x.CreatedAt,x.EngineVersion,results=JsonSerializer.Deserialize<JsonElement>(x.ResultsJson)})};
    }
    public async Task<object> StatementBatch(string user,StatementBatchInput b,bool execute) {
        Require(b.Items.Length is >0 and <=20 && b.Items.Select(x=>x.Id).Distinct().Count()==b.Items.Length,"每批1至20条，不可重复");
        Require(b.Action is "Confirm" or "Pending" or "Ignored" && !string.IsNullOrWhiteSpace(b.Reason) && b.Reason.Length<=1000,"操作或处理原因无效");
        var results=new List<object>();var claimed=new HashSet<(string Account,string Transaction)>();var initialVersions=new Dictionary<string,string>();
        foreach(var item in b.Items) {
            try {
                var row=await StatementOwned(user,item.Id);Version(row,item.Version);await Account(user,row.AccountId,false);
                if(b.Action=="Confirm") {
                    Require(item.TransactionId!=null && item.TransactionVersion!=null,"缺少匹配对象");
                    Require(!claimed.Contains((row.AccountId,item.TransactionId!)),"同一批次有多个流水竞争同一账户交易，请使用组合分配");
                    var t=await Transaction(user,item.TransactionId!);
                    if(initialVersions.TryGetValue(t.Id,out var initial))Require(item.TransactionVersion==initial,"同批次内部交易版本不一致");else{Version(t,item.TransactionVersion);initialVersions[t.Id]=item.TransactionVersion!;}
                    await ConfirmStatement(user,item.Id,new(item.TransactionId!,item.Version,execute?t.Version.ToString():item.TransactionVersion!,b.Reason),execute);claimed.Add((row.AccountId,t.Id));
                } else await ResolveStatement(user,item.Id,new(item.Version,b.Action,b.Reason),execute);
                results.Add(new{item.Id,success=true});
            }catch(ApiException e){results.Add(new{item.Id,success=false,error=e.Message});}
        }
        return new{executed=execute,results};
    }
}
