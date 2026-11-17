using System.Text;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
 public async Task<object> InterestAttachments(string user,string id) {await RequireConcerts(user);await Document(user,id,InterestPurchaseKind);return await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="MusicAttachment" && x.Name.StartsWith(id+"/")).Select(x=>new{x.Id,name=x.Name.Substring(id.Length+1),x.ContentType,size=x.Content.Length}).ToArrayAsync();}
 public async Task<object> InterestUpload(string user,string id,IFormFile file,string? version) {
  await RequireConcerts(user);var doc=await Document(user,id,InterestPurchaseKind);Version(doc,version);
  Require(file.Length is >0 and <=10*1024*1024 && await db.Documents.CountAsync(x=>x.UserId==user && x.Kind=="MusicAttachment" && x.Name.StartsWith(id+"/"))<100,"附件最多100个，每个最多10MB");
  using var stream=new MemoryStream();await file.CopyToAsync(stream);var bytes=stream.ToArray();var ext=Path.GetExtension(file.FileName).ToLowerInvariant();
  var png=bytes.Length>8 && bytes.Take(8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10});var jpg=bytes.Length>3 && bytes[0]==255 && bytes[1]==216 && bytes[2]==255;var pdf=bytes.Length>5 && Encoding.ASCII.GetString(bytes,0,5)=="%PDF-";
  Require(ext==".png" && png || ext is ".jpg" or ".jpeg" && jpg || ext==".pdf" && pdf,"仅支持内容匹配的PNG/JPG/PDF");var name=Path.GetFileName(file.FileName);ConcertText(name,150,true);
  var attachment=new StoredDocument{UserId=user,Kind="MusicAttachment",Name=id+"/"+name,ContentType=png?"image/png":jpg?"image/jpeg":"application/pdf",Content=bytes};db.Add(attachment);doc.Version++;ConcertAudit(user,id,"InterestAttachment",new{attachment.Id});return new{attachment.Id,version=doc.Version.ToString()};
 }
 public async Task<StoredDocument> InterestDownload(string user,string id,string attachmentId) {await RequireConcerts(user);await Document(user,id,InterestPurchaseKind);var d=await Document(user,attachmentId,"MusicAttachment");Require(d.Name.StartsWith(id+"/"),"附件不属于当前购买记录");return d;}
 public async Task<object> InterestHistory(string user,string id) {await RequireConcerts(user);await Document(user,id,InterestPurchaseKind);return await db.Set<AuditRecord>().AsNoTracking().Where(x=>x.UserId==user && x.ResourceType=="Concert" && x.ResourceId==id).OrderByDescending(x=>x.CreatedAt).Take(100).Select(x=>new{x.Action,x.CreatedAt,x.ChangesJson}).ToArrayAsync();}
 public async Task<object> InterestApproval(string user,string id,string? version) {await RequireConcerts(user);var d=await Document(user,id,InterestPurchaseKind);Version(d,version);var b=InterestRead<InterestPurchase>(d);Require(b.State=="Planned","仅购买计划可提交建议审批");var amount=b.Items.Sum(InterestRules.Paid);Require(amount>0,"计划金额须大于0");return await ApprovalSave(user,null,new(string.Join("、",b.Items.Select(x=>x.Name)).Substring(0,Math.Min(100,string.Join("、",b.Items.Select(x=>x.Name)).Length)),amount,b.Currency,"音乐兴趣商品购买计划；仅建议，不创建扣款。"),"0");}
}
