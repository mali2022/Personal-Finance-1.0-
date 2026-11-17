using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed record InvestmentProjectClassification(string Status,string? ProjectId,string? ProjectName,DateOnly? EffectiveFrom,string? SourceId,string Policy);
public sealed partial class FinanceService
{
 private const string InvestmentProjectPolicy="Whole-asset classification at the report end date; not transaction allocation, historical ownership reconstruction or a project-level aggregate XIRR";
 public async Task<object> SaveInvestmentProject(string user,string id,InvestmentProjectAssignmentInput input,string? version){
  var asset=await Investment(user,id);Version(asset,version);
  Require(input.ClassifyWholeAsset,"须确认该分类针对整项资产，而非逐笔交易项目分摊");
  Require(input.EffectiveFrom.Year>=1900&&input.EffectiveFrom<=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date),"分类生效日期无效");
  Require(input.Reason?.Trim().Length is >0 and <=200,"请填写项目分类依据");
  if(input.ProjectId!=null&&!await db.Directory.AnyAsync(x=>x.UserId==user&&x.Id==input.ProjectId&&x.Kind=="projects"&&x.Status=="Active"))throw new ApiException(404,"项目不存在或不可用");
  var doc=new StoredDocument{UserId=user,Kind="InvestmentProjectAssignment",Name=id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(input,Json)};db.Add(doc);asset.Version++;asset.UpdatedAt=DateTimeOffset.UtcNow;
  return new{doc.Id,assetId=id,input.ProjectId,input.EffectiveFrom,input.Reason,policy=InvestmentProjectPolicy,version=asset.Version.ToString()};
 }
 public async Task<object> InvestmentProject(string user,string id,DateOnly? date,CancellationToken ct){await Investment(user,id);var at=date??DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date);Require(at.Year>=1900,"分类日期无效");return(await InvestmentProjects(user,[id],at,ct))[id];}
 private async Task<Dictionary<string,InvestmentProjectClassification>> InvestmentProjects(string user,string[] ids,DateOnly date,CancellationToken ct){
  var docs=await db.Documents.AsNoTracking().Where(x=>x.UserId==user&&x.Kind=="InvestmentProjectAssignment"&&ids.Contains(x.Name)).OrderByDescending(x=>x.CreatedAt).ThenByDescending(x=>x.Id).Take(10001).ToArrayAsync(ct);
  Require(docs.Length<=10000,"项目分类历史超过读取上限");
  var entries=docs.Select(x=>new{Doc=x,Value=JsonSerializer.Deserialize<InvestmentProjectAssignmentInput>(x.Content,Json)!}).Where(x=>x.Value.EffectiveFrom<=date).ToArray();
  var projectIds=entries.Select(x=>x.Value.ProjectId).Where(x=>x!=null).Distinct().ToArray();
  var projects=await db.Directory.AsNoTracking().Where(x=>x.UserId==user&&x.Kind=="projects"&&projectIds.Contains(x.Id)).ToDictionaryAsync(x=>x.Id,x=>x.Name,ct);
  return ids.ToDictionary(id=>id,id=>{var row=entries.Where(x=>x.Doc.Name==id).OrderByDescending(x=>x.Value.EffectiveFrom).ThenByDescending(x=>x.Doc.CreatedAt).ThenByDescending(x=>x.Doc.Id,StringComparer.Ordinal).FirstOrDefault();return row==null?new InvestmentProjectClassification("Unassigned",null,null,null,null,InvestmentProjectPolicy):new(row.Value.ProjectId==null?"Unassigned":projects.ContainsKey(row.Value.ProjectId)?"Classified":"ProjectUnavailable",row.Value.ProjectId,row.Value.ProjectId==null?null:projects.GetValueOrDefault(row.Value.ProjectId),row.Value.EffectiveFrom,row.Doc.Id,InvestmentProjectPolicy);});
 }
}
