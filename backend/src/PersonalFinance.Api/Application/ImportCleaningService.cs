using PersonalFinance.Api.Contracts;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    public async Task<object> ImportJobHistory(string user,IQueryCollection query)
    {
        var(page,size)=Paging(query);var q=db.Imports.AsNoTracking().Where(x=>x.UserId==user);
        var total=await q.CountAsync();
        var items=await q.OrderByDescending(x=>db.Set<ImportCleaningEvent>().Where(e=>e.UserId==user && e.ImportJobId==x.Id).Max(e=>(DateTimeOffset?)e.CreatedAt)).ThenBy(x=>x.Id)
            .Skip((page-1)*size).Take(size).Select(x=>new{x.Id,x.FileName,x.Source,x.State,x.Imported,x.SourceEncoding,x.SourceHash,
                createdAt=db.Set<ImportCleaningEvent>().Where(e=>e.UserId==user && e.ImportJobId==x.Id && e.Action=="SourceUploaded").Select(e=>(DateTimeOffset?)e.CreatedAt).FirstOrDefault(),
                sameFileCount=x.SourceHash==""?0:db.Imports.Count(j=>j.UserId==user && j.SourceHash==x.SourceHash)}).ToArrayAsync();
        return new{items,total,page,pageSize=size};
    }
    public async Task<StoredDocument> ImportSourceDocument(string user,string id)
    {
        Require(await db.Imports.AnyAsync(x=>x.UserId==user && x.Id==id),"导入任务不存在");
        var source=await db.Set<ImportCleaningEvent>().AsNoTracking().FirstOrDefaultAsync(x=>x.UserId==user && x.ImportJobId==id && x.Action=="SourceUploaded")??throw new ApiException(404,"历史任务未保存原文件，可导出原始行数据");
        var documentId=JsonNode.Parse(source.AfterJson)!["documentId"]!.GetValue<string>();return await Document(user,documentId,"ImportSource");
    }
    public static string CleanImportText(string value) => value.Normalize(NormalizationForm.FormKC).Trim().Trim('\uFEFF').Trim();
    public static string CleanImportAmount(string value) => CleanImportText(value).Replace("¥","").Replace("￥","").Replace(",","").Replace(" ","");
    public static bool ExcludedImportStatus(string value) => new[]{"交易关闭","已关闭","交易失败","失败","已撤销","已取消","已作废","Closed","Failed","Cancelled"}.Contains(CleanImportText(value),StringComparer.OrdinalIgnoreCase);
    private void RecordImportCleaning(string user,ImportJob job,ImportRow row,string action,string source,string reason,string before)
    {
        if(action is not ("Mapped" or "AiAccepted" or "DuplicateReview") && before==row.DataJson)return;
        db.Add(new ImportCleaningEvent{UserId=user,ImportJobId=job.Id,RowId=row.Id,RowIndex=row.Index,JobVersion=job.Version,
            Action=action,Source=source,Reason=reason,BeforeJson=before,AfterJson=row.DataJson});
    }
    private async Task NormalizeImportMerchant(string user,JsonObject node)
    {
        var name=node["merchant"]?.GetValue<string>()??"";
        DirectoryItem? master;
        var selected=node["merchantId"]?.GetValue<string>();
        if(!string.IsNullOrEmpty(selected))
        {
            master=await MerchantMaster(user,selected);
            Require(master.Status=="Active","商户已停用，请重新核对商户");
        }
        else master=await ResolveMerchant(user,name);
        node["merchantId"]=master?.Id;
        if(master!=null){node["merchant"]=master.Name;node["merchantMatch"]="ExactOrAlias";}
        else node["merchantMatch"]=string.IsNullOrWhiteSpace(name)?"Empty":"Unmatched";
    }
    public async Task<object> ImportCleaningHistory(string user,string id,IQueryCollection query)
    {
        var job=await db.Imports.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id)??throw new ApiException(404,"导入任务不存在");
        var(page,size)=Paging(query);var q=db.Set<ImportCleaningEvent>().AsNoTracking().Where(x=>x.UserId==user && x.ImportJobId==id);
        if(int.TryParse(query["rowIndex"],out var index))q=q.Where(x=>x.RowIndex==index);
        var total=await q.CountAsync();var items=await q.OrderByDescending(x=>x.CreatedAt).ThenByDescending(x=>x.Id).Skip((page-1)*size).Take(size).ToArrayAsync();
        return new{items=items.Select(x=>new{x.Id,x.RowId,x.RowIndex,x.JobVersion,x.Action,x.RuleVersion,x.Source,x.Reason,x.CreatedAt,before=JsonSerializer.Deserialize<JsonElement>(x.BeforeJson),after=JsonSerializer.Deserialize<JsonElement>(x.AfterJson)}),total,page,pageSize=size,job.SourceHash,job.SourceEncoding,job.HeaderRow};
    }
    public async Task<object> ImportCleaningExport(string user,string id)
    {
        var job=await Import(user,id);var events=await db.Set<ImportCleaningEvent>().AsNoTracking().Where(x=>x.UserId==user && x.ImportJobId==id).OrderBy(x=>x.CreatedAt).ThenBy(x=>x.Id).ToArrayAsync();
        var suggestions=await db.Set<ImportRecognitionSuggestion>().AsNoTracking().Where(x=>x.UserId==user && x.ImportJobId==id).OrderBy(x=>x.CreatedAt).ToArrayAsync();
        return new{suggestions,schemaVersion="4.1.2",job.Id,job.FileName,job.Source,job.SourceHash,job.SourceEncoding,job.HeaderRow,version=job.Version.ToString(),headers=JsonSerializer.Deserialize<JsonElement>(job.HeadersJson),originalRows=JsonSerializer.Deserialize<JsonElement>(job.RawRowsJson),mapping=JsonSerializer.Deserialize<JsonElement>(job.MappingJson),rows=job.Rows.OrderBy(x=>x.Index).Select(ImportRowDto),events=events.Select(x=>new{x.Id,x.RowId,x.RowIndex,x.JobVersion,x.Action,x.RuleVersion,x.Source,x.Reason,x.CreatedAt,before=JsonSerializer.Deserialize<JsonElement>(x.BeforeJson),after=JsonSerializer.Deserialize<JsonElement>(x.AfterJson)})};
    }
    public async Task<object> UndoImportCleaning(string user,string id,string eventId,string? version)
    {
        var job=await Import(user,id);Version(job,version);Require(job.State=="Preview","仅未入账预览可撤销清洗");
        Require(!await db.Set<StatementRecord>().AnyAsync(x=>x.UserId==user&&x.ImportJobId==id),"已接收的来源记录已冻结，请在对账工作台复核");
        var item=await db.Set<ImportCleaningEvent>().SingleOrDefaultAsync(x=>x.UserId==user && x.ImportJobId==id && x.Id==eventId)??throw new ApiException(404,"清洗记录不存在");
        Require(item.Action is "ManualEdit" or "AiAccepted" or "Undo","此步骤不支持撤销；重新映射可从原始数据重建预览");
        var row=job.Rows.SingleOrDefault(x=>x.Id==item.RowId)??throw new ApiException(409,"来源行已重新映射");
        Require(row.DataJson==item.AfterJson,"记录已有后续修改，请从最后一次修改开始撤销");
        var before=row.DataJson;row.DataJson=item.BeforeJson;job.Version++;await ValidateImportRow(user,job,row);
        RecordImportCleaning(user,job,row,"Undo","User","撤销清洗步骤 "+item.Id,before);return ImportDto(job);
    }
    public async Task<object> RefreshImportMerchants(string user,string id,string? version)
    {
        var job=await Import(user,id);Version(job,version);Require(job.State=="Preview","仅预览可重新归一商户");
        Require(!await db.Set<StatementRecord>().AnyAsync(x=>x.UserId==user&&x.ImportJobId==id),"已接收的来源记录已冻结，请在对账工作台复核");job.Version++;
        foreach(var row in job.Rows.OrderBy(x=>x.Index))
        {
            var before=row.DataJson;var node=JsonNode.Parse(before)!.AsObject();node["merchantId"]=null;
            await NormalizeImportMerchant(user,node);row.DataJson=node.ToJsonString();await ValidateImportRow(user,job,row);
            RecordImportCleaning(user,job,row,"MerchantRefresh","Rule","按当前商户主数据及明确别名重新匹配",before);
        }
        return ImportDto(job);
    }
}
