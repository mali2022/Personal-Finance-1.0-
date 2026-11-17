using System.Text;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
 public async Task<object> FestivalUpload(string user,string id,IFormFile file,string? version) {
  var d=await Document(user,id,FestivalKind);Version(d,version);Require(file.Length is >0 and <=10485760,"附件须为1字节至10MB");var prefix=id+"/";Require(await db.Documents.CountAsync(x=>x.UserId==user && x.Kind=="FestivalAttachment" && x.Name.StartsWith(prefix))<30,"每个节日最多30个附件");
  var name=Path.GetFileName(file.FileName);Require(name.Length is >0 and <=150,"文件名无效");await using var stream=new MemoryStream();await file.CopyToAsync(stream);var bytes=stream.ToArray();var png=bytes.Length>8 && bytes.Take(8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10});var jpg=bytes.Length>3&&bytes[0]==255&&bytes[1]==216&&bytes[2]==255;var pdf=bytes.Length>5&&Encoding.ASCII.GetString(bytes,0,5)=="%PDF-";Require(png||jpg||pdf,"仅支持有效PNG、JPEG、PDF文件");
  var attachment=new StoredDocument{UserId=user,Kind="FestivalAttachment",Name=prefix+name,ContentType=png?"image/png":jpg?"image/jpeg":"application/pdf",Content=bytes};db.Add(attachment);FestivalArchive(user,d,"Attachment:"+attachment.Id);d.Version++;return new{attachment.Id,version=d.Version.ToString()};
 }
 public async Task<object> FestivalAttachments(string user,string id){await Document(user,id,FestivalKind);var prefix=id+"/";return await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalAttachment" && x.Name.StartsWith(prefix)).Select(x=>new{x.Id,name=x.Name.Substring(prefix.Length),x.ContentType,size=x.Content.Length}).ToArrayAsync();}
 public async Task<StoredDocument> FestivalAttachment(string user,string id,string attachmentId){await Document(user,id,FestivalKind);var d=await Document(user,attachmentId,"FestivalAttachment");Require(d.Name.StartsWith(id+"/",StringComparison.Ordinal),"附件不属于该节日");return d;}
}
public static class FestivalAttachmentEndpoints {
 public static void Map(RouteGroupBuilder api){
  api.MapGet("/festivals/{id}/attachments",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FestivalAttachments(FinanceEndpoints.User(c),id)));
  api.MapGet("/festivals/{id}/attachments/{attachmentId}",async(string id,string attachmentId,FinanceService f,HttpContext c)=>{var d=await f.FestivalAttachment(FinanceEndpoints.User(c),id,attachmentId);return Results.File(d.Content,d.ContentType,d.Name[(id.Length+1)..]);});
  api.MapPost("/festivals/{id}/attachments",async(string id,FinanceService f,HttpContext c)=>{var form=await c.Request.ReadFormAsync();var file=form.Files.GetFile("file");FinanceService.Require(file!=null,"请选择附件");return await FinanceEndpoints.Write(c,f,new{id,name=Path.GetFileName(file!.FileName),file.Length},async()=>await f.FestivalUpload(FinanceEndpoints.User(c),id,file,c.Request.Headers.IfMatch));}).DisableAntiforgery();
 }
}
