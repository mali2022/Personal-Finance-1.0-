using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record FuelStationInput(string Name,string Brand,string Address,string[] Aliases,bool Favorite=false,bool Archived=false);
public sealed record FuelStationMerge(string TargetId,string TargetVersion);
public static class FuelStationRules {
 public static string Normalize(string value)=>string.Join(" ",(value??"").Split((char[]?)null,StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();
 public static FuelStationInput Validate(FuelStationInput b){
  FinanceService.Require(!string.IsNullOrWhiteSpace(b.Name)&&b.Name.Length<=160,"站点名称须为1至160字");
  FinanceService.Require((b.Brand??"").Length<=100&&(b.Address??"").Length<=500&&b.Aliases!=null&&b.Aliases.Length<=100,"站点资料超限");
  FinanceService.Require(b.Aliases!.All(a=>!string.IsNullOrWhiteSpace(a)&&a.Length<=160),"别名须为1至160字");
  return b with{Name=b.Name.Trim(),Brand=(b.Brand??"").Trim(),Address=(b.Address??"").Trim(),Aliases=b.Aliases!.Append(b.Name).Select(Normalize).Distinct().Order().ToArray()};
 }
}
public sealed partial class FinanceService {
 const string FuelStationKind="FuelStation";
 async Task<StoredDocument[]> StationDocuments(string user)=>await db.Documents.Where(d=>d.UserId==user&&d.Kind==FuelStationKind).ToArrayAsync();
 public async Task<object> FuelStations(string user)=>(await StationDocuments(user)).Select(d=>new{d.Id,version=d.Version.ToString(),input=JsonSerializer.Deserialize<FuelStationInput>(d.Content,Json)}).ToArray();
 public async Task<object> FuelSaveStation(string user,FuelStationInput input,string? id,string? version){
  var b=FuelStationRules.Validate(input);var docs=await StationDocuments(user);
  Require(!docs.Where(d=>d.Id!=id).Any(d=>JsonSerializer.Deserialize<FuelStationInput>(d.Content,Json)!.Aliases.Intersect(b.Aliases).Any()),"名称或别名已属于另一站点，请核实后合并");
  var doc=id==null?new StoredDocument{UserId=user,Kind=FuelStationKind,ContentType="application/json"}:await Document(user,id,FuelStationKind);
  if(id==null)db.Add(doc);else {Version(doc,version);doc.Version++;}doc.Name=b.Name;doc.Content=JsonSerializer.SerializeToUtf8Bytes(b,Json);return new{doc.Id};
 }
 public async Task<object> FuelMergeStation(string user,string sourceId,string? version,FuelStationMerge b){
  Require(sourceId!=b.TargetId,"请选择不同的目标站点");var source=await Document(user,sourceId,FuelStationKind);var target=await Document(user,b.TargetId,FuelStationKind);Version(source,version);Version(target,b.TargetVersion);
  var a=JsonSerializer.Deserialize<FuelStationInput>(source.Content,Json)!;var t=JsonSerializer.Deserialize<FuelStationInput>(target.Content,Json)!;
  var merged=FuelStationRules.Validate(t with{Aliases=t.Aliases.Concat(a.Aliases).ToArray(),Favorite=t.Favorite||a.Favorite});
  var audit=new StoredDocument{UserId=user,Kind="FuelStationMerge",Name=target.Id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new{sourceId,targetId=target.Id,source=a,target=t,merged},Json)};db.Add(audit);
  target.Content=JsonSerializer.SerializeToUtf8Bytes(merged,Json);target.Version++;db.Remove(source);return new{target.Id};
 }
 async Task<Dictionary<string,string>> FuelStationAliases(string user)=>(await StationDocuments(user)).Select(d=>JsonSerializer.Deserialize<FuelStationInput>(d.Content,Json)!).SelectMany(s=>s.Aliases.Select(a=>new{alias=a,s.Name})).ToDictionary(x=>x.alias,x=>x.Name);
}
