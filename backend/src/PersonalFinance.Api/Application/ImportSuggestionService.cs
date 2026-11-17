using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record ImportSuggestionDecision(bool Accept);
public sealed partial class FinanceService
{
    public async Task<object> SaveImportSuggestions(string user,ImportRecognitionInput input,ImportRecognitionChoice[] choices,Dictionary<string,string> hashes,string requestId)
    {
        var job=await Import(user,input.ImportJobId);Version(job,input.Version);Require(job.State=="Preview","导入任务已改变");
        foreach(var pair in hashes)Require(job.Rows.Any(x=>x.Id==pair.Key && AuthService.Hash(x.DataJson)==pair.Value),"识别期间预览已改变，请重新识别");
        foreach(var choice in choices){
            var old=await db.Set<ImportRecognitionSuggestion>().Where(x=>x.UserId==user && x.ImportJobId==job.Id && x.RowId==choice.RowId && x.State=="Pending").ToArrayAsync();
            foreach(var stale in old){stale.State="Superseded";stale.Version++;}
            db.Add(new ImportRecognitionSuggestion{UserId=user,ImportJobId=job.Id,RowId=choice.RowId,RowHash=hashes[choice.RowId],RequestId=requestId,MerchantId=choice.MerchantId,CategoryId=choice.CategoryId,Confidence=choice.Confidence,Reason=choice.Reason});
        }
        job.Version++;return ImportDto(job);
    }
    public async Task<object> ImportSuggestions(string user,string id)
    {
        Require(await db.Imports.AnyAsync(x=>x.UserId==user && x.Id==id),"导入任务不存在");
        var suggestions=await db.Set<ImportRecognitionSuggestion>().AsNoTracking().Where(x=>x.UserId==user && x.ImportJobId==id && x.State=="Pending").OrderByDescending(x=>x.CreatedAt).Take(100).ToArrayAsync();
        var merchants=await db.Directory.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="merchants").ToDictionaryAsync(x=>x.Id,x=>x.Name);
        var categories=(await Categories(user)).ToDictionary(x=>x.Id,x=>x.Name);
        var rows=await db.ImportRows.AsNoTracking().Where(x=>x.UserId==user && x.ImportJobId==id).ToArrayAsync();var byId=rows.ToDictionary(x=>x.Id);
        return new{items=suggestions.Select(x=>new{x.Id,x.RowId,index=byId.GetValueOrDefault(x.RowId)?.Index,x.MerchantId,merchant=x.MerchantId==null?null:merchants.GetValueOrDefault(x.MerchantId),x.CategoryId,category=x.CategoryId==null?null:categories.GetValueOrDefault(x.CategoryId),x.Confidence,x.Reason,x.RequestId,x.State,x.CreatedAt,stale=!byId.TryGetValue(x.RowId,out var row)||AuthService.Hash(row.DataJson)!=x.RowHash})};
    }
    public async Task<object> ApplyImportSuggestion(string user,string id,string suggestionId,ImportSuggestionDecision input,string? version)
    {
        var job=await Import(user,id);Version(job,version);Require(job.State=="Preview","仅导入预览可处理建议");
        var suggestion=await db.Set<ImportRecognitionSuggestion>().SingleOrDefaultAsync(x=>x.UserId==user && x.ImportJobId==id && x.Id==suggestionId)??throw new ApiException(404,"建议不存在");
        Require(suggestion.State=="Pending","建议已经处理");var row=job.Rows.SingleOrDefault(x=>x.Id==suggestion.RowId);
        if(input.Accept){
            Require(!await db.Set<StatementRecord>().AnyAsync(x=>x.UserId==user&&x.ImportJobId==id),"已接收的来源记录已冻结，请在对账工作台复核");
            Require(row!=null && AuthService.Hash(row.DataJson)==suggestion.RowHash,"建议已过期，请重新识别");
            Require(row!.Status is "Ready" or "Invalid","请先核对重复或跳过状态");var before=row.DataJson;var node=JsonNode.Parse(before)!.AsObject();
            if(suggestion.MerchantId!=null){var master=await MerchantMaster(user,suggestion.MerchantId);Require(master.Status=="Active","建议商户已停用");node["merchantId"]=master.Id;node["merchant"]=master.Name;}
            if(suggestion.CategoryId!=null){await Category(user,suggestion.CategoryId,node["type"]!.GetValue<string>());node["categoryId"]=suggestion.CategoryId;node["needsReview"]=false;}
            row.DataJson=node.ToJsonString();job.Version++;await ValidateImportRow(user,job,row);
            RecordImportCleaning(user,job,row,"AiAccepted","DeepSeek","人工采纳AI建议；请求 "+suggestion.RequestId+"；模型自评 "+suggestion.Confidence+"；"+suggestion.Reason,before);
        }else job.Version++;
        suggestion.State=input.Accept?"Applied":"Rejected";suggestion.Version++;
        return ImportDto(job);
    }
}
