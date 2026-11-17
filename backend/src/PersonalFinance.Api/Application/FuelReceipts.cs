using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record FuelReceiptInput(string FileName,string ContentType,string Base64,string? OcrText=null,string? ReviewedText=null,string? OcrEngine=null,bool FieldsConfirmed=false);
public sealed record FuelRecordWithReceipt(FuelRecordInput Record,FuelReceiptInput? Receipt);
public static class FuelReceiptRules {
 public static byte[] Validate(FuelReceiptInput b){
  FinanceService.Require(b.Base64!=null&&b.Base64.Length<=4194304,"凭证最大3MB");byte[] bytes;try{bytes=Convert.FromBase64String(b.Base64!);}catch(FormatException){throw new ApiException(422,"凭证编码无效");}
  FinanceService.Require((b.OcrText??"").Length<=20000&&(b.ReviewedText??"").Length<=20000&&(b.OcrEngine==null||b.OcrEngine=="tesseract-browser"),"识别来源或文本无效");
  FinanceService.Require(bytes.Length is >0 and <=3*1024*1024,"凭证最大3MB");
  var png=bytes.Length>=8&&bytes.Take(8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10});var jpg=bytes.Length>3&&bytes[0]==255&&bytes[1]==216&&bytes[2]==255;var pdf=bytes.Length>=5&&System.Text.Encoding.ASCII.GetString(bytes,0,5)=="%PDF-";
  var extension=Path.GetExtension(b.FileName??"").ToLowerInvariant();FinanceService.Require(b.FileName?.Length is >0 and <=150&&!b.FileName.Contains('/')&&!b.FileName.Contains('\\'),"凭证文件名无效");
  FinanceService.Require(png&&b.ContentType=="image/png"&&extension==".png"||jpg&&b.ContentType=="image/jpeg"&&extension is ".jpg" or ".jpeg"||pdf&&b.ContentType=="application/pdf"&&extension==".pdf","仅支持内容、扩展名与类型一致的PNG/JPG/PDF");return bytes;
 }
}
public sealed partial class FinanceService {
 public async Task<object> FuelSaveWithReceipt(string user,FuelRecordWithReceipt b,string? id,string? version){
  var bytes=b.Receipt==null?null:FuelReceiptRules.Validate(b.Receipt);
  if(id!=null&&bytes!=null)Require(await db.Documents.CountAsync(d=>d.UserId==user&&d.Kind=="FuelReceipt"&&d.Name.StartsWith(id+"/"))<5,"每条加油记录最多5份凭证");
  var result=await FuelSaveRecord(user,b.Record,id,version);var recordId=JsonSerializer.SerializeToElement(result,Json).GetProperty("id").GetString()!;
  if(bytes!=null){var receipt=new StoredDocument{UserId=user,Kind="FuelReceipt",Name=recordId+"/"+b.Receipt!.FileName,ContentType=b.Receipt.ContentType,Content=bytes};db.Add(receipt);if(b.Receipt.OcrText!=null)db.Add(new StoredDocument{UserId=user,Kind="FuelReceiptRecognition",Name=receipt.Id,ContentType="application/json",Content=JsonSerializer.SerializeToUtf8Bytes(new{b.Receipt.OcrText,b.Receipt.ReviewedText,b.Receipt.OcrEngine,b.Receipt.FieldsConfirmed},Json)});}return result;
 }
 public async Task<object> FuelReceipts(string user,string id){await FuelOwned<FuelRecord>(user,id);return await db.Documents.AsNoTracking().Where(d=>d.UserId==user&&d.Kind=="FuelReceipt"&&d.Name.StartsWith(id+"/")).Select(d=>new{d.Id,name=d.Name.Substring(id.Length+1),d.ContentType,size=d.Content.Length,version=d.Version.ToString()}).ToArrayAsync();}
 public async Task<StoredDocument> FuelReceipt(string user,string id,string receiptId){await FuelOwned<FuelRecord>(user,id);var doc=await Document(user,receiptId,"FuelReceipt");Require(doc.Name.StartsWith(id+"/"),"凭证不属于此记录");return doc;}
 public async Task<object> FuelDeleteReceipt(string user,string id,string receiptId,string? version){var doc=await FuelReceipt(user,id,receiptId);Version(doc,version);var recognition=await db.Documents.Where(d=>d.UserId==user&&d.Kind=="FuelReceiptRecognition"&&d.Name==receiptId).ToArrayAsync();db.RemoveRange(recognition);db.Remove(doc);return new{id=receiptId};}
}
