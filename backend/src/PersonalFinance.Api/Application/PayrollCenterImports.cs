using System.Globalization;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using CsvHelper;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record PayrollImportRow(int Index, SlipSave? Slip, string Fingerprint, string[] Issues, string? SlipId = null);
public sealed partial class FinanceService
{
    public async Task<object> PayrollImportUpload(string user,IFormFile file) {
        Require(file.Length is >0 and <=10*1024*1024,"工资文件须小于10MB");var ext=Path.GetExtension(file.FileName).ToLowerInvariant();Require(ext is ".csv" or ".xlsx" or ".png" or ".jpg" or ".jpeg","支持CSV、XLSX及PNG/JPG工资图片");
        using var stream=new MemoryStream();await file.CopyToAsync(stream);var bytes=stream.ToArray();var rows=new List<string[]>();string mime="text/csv";
        if(ext==".xlsx") {using(var zip=new ZipArchive(new MemoryStream(bytes),ZipArchiveMode.Read))Require(zip.Entries.Count<1000 && zip.Entries.Sum(x=>x.Length)<50*1024*1024,"Excel解压规模过大");using var book=new XLWorkbook(new MemoryStream(bytes));var range=book.Worksheet(1).RangeUsed();Require(range!=null && range.RowCount()<=1001 && range.ColumnCount()<=60,"最多1000行、60列");foreach(var row in range!.Rows())rows.Add(row.Cells().Select(x=>x.GetFormattedString(CultureInfo.InvariantCulture)).ToArray());mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";}
        else if(ext==".csv") {using var reader=new StreamReader(new MemoryStream(bytes),Encoding.UTF8,true);using var csv=new CsvReader(reader,CultureInfo.InvariantCulture);while(await csv.ReadAsync()){Require(rows.Count<=1000 && csv.Parser.Count<=60,"最多1000行、60列");rows.Add(csv.Parser.Record??[]);}}
        else {using var image=SkiaSharp.SKBitmap.Decode(bytes);Require(image!=null && image.Width*(long)image.Height<=24000000,"图片无效或像素过大");mime=ext==".png"?"image/png":"image/jpeg";rows.Add(["月份","发薪日期","应发","基本工资","奖金","补贴","养老","医疗","失业","公积金","个税","其他扣款","实发"]);}
        Require(rows.Count>0 && rows[0].Length>0 && rows[0].All(x=>!string.IsNullOrWhiteSpace(x)) && rows[0].Distinct().Count()==rows[0].Length,"列名须非空且不重复");
        var doc=new StoredDocument{UserId=user,Kind="PayrollSource",Name=Text(Path.GetFileName(file.FileName),200,true),ContentType=mime,Content=bytes};db.Add(doc);
        var job=new PayrollImportJob{UserId=user,FileName=doc.Name,DocumentId=doc.Id,HeadersJson=JsonSerializer.Serialize(rows[0],Json),RowsJson=JsonSerializer.Serialize(rows.Skip(1).ToArray(),Json),Fingerprint=Convert.ToHexString(SHA256.HashData(bytes))};db.Add(job);return new{job.Id,version="1",image=ext is ".png" or ".jpg" or ".jpeg",note="图片可使用本地OCR或对照原图录入，必须逐项核对；不会自动入账。"};
    }
    public async Task<object> PayrollImportDetail(string user,string id) {var x=await PayOwned<PayrollImportJob>(user,id);return new{x.Id,x.FileName,x.DocumentId,x.State,x.Imported,headers=JsonSerializer.Deserialize<string[]>(x.HeadersJson,Json),rows=JsonSerializer.Deserialize<string[][]>(x.RowsJson,Json),mapping=JsonSerializer.Deserialize<JsonElement>(x.MappingJson,Json),preview=JsonSerializer.Deserialize<JsonElement>(x.PreviewJson,Json),version=x.Version.ToString()};}
    public async Task<object> PayrollImportPreviewSave(string user,string id,PayrollImportPreview b,string? version) {
        var job=await PayOwned<PayrollImportJob>(user,id);Version(job,version);Require(job.State!="Committed","已保存导入不可重写");var employment=await PayOwned<PayrollEmployment>(user,b.EmploymentId);var employer=await PayOwned<PayrollEmployer>(user,employment.EmployerId);AssetCurrency(b.Currency);
        var headers=JsonSerializer.Deserialize<string[]>(job.HeadersJson,Json)!;var rows=b.Rows??JsonSerializer.Deserialize<string[][]>(job.RowsJson,Json)!;Require(rows.Length is >0 and <=1000 && rows.All(x=>x is not null && x.Length<=60),"请输入1至1000条工资记录");if(b.Mapping is null)throw new ApiException(422,"字段映射无效");Require(b.Mapping.Count<=30 && b.Mapping.Values.All(x=>x=="" || headers.Contains(x)),"字段映射无效");
        string Field(string[] row,string key){if(!b.Mapping.TryGetValue(key,out var h))return "";var index=Array.IndexOf(headers,h);return index<0 || index>=row.Length?"":(row[index]??"").Trim();}
        var preview=new List<PayrollImportRow>();var seen=new HashSet<string>();
        foreach(var pair in rows.Select((row,index)=>(row,index))){var row=pair.row;var issues=new List<string>();SlipSave? slip=null;string hash="";
            try {
                var month=Field(row,"month");Month(month);Require(DateOnly.TryParse(Field(row,"payDate"),CultureInfo.InvariantCulture,DateTimeStyles.None,out var payDate),"发薪日期格式无效");PayrollDate(payDate);
                var earnedMonth=DateOnly.Parse(month+"-01",CultureInfo.InvariantCulture);Require(employment.StartDate<=earnedMonth.AddMonths(1).AddDays(-1) && (employment.EndDate==null || employment.EndDate>=earnedMonth),"工资归属月不在任职区间");
                decimal Amount(string key){var raw=Field(row,key).Replace(",","").Replace("¥","").Replace("￥","");return raw==""?0:Nonnegative(raw);}
                var parts=new List<PayItem>();var fields=new[]{("base","Base","Earning"),("bonus","AnnualBonus","Earning"),("allowance","Allowance","Earning"),("performance","Performance","Earning"),("otherEarnings","Other","Earning"),("pension","Pension","Deduction"),("medical","Medical","Deduction"),("unemployment","Unemployment","Deduction"),("housing","HousingFund","Deduction"),("tax","Tax","Deduction"),("otherDeductions","OtherDeduction","Deduction")};
                foreach(var(field,cat,kind) in fields){var amount=Amount(field);if(amount!=0)parts.Add(new(cat,field,kind,cat,M(amount),kind=="Earning"?"Unspecified":"NotApplicable"));}
                var earnings=parts.Where(x=>x.Kind=="Earning").Sum(x=>Money(x.Amount));var grossRaw=Field(row,"gross");if(earnings==0 && grossRaw!=""){var gross=Amount("gross");parts.Add(new("应发 / Gross","gross","Earning","Other",M(gross),"Unspecified"));earnings=gross;}
                if(grossRaw!="")Require(earnings==Amount("gross"),"应发金额与明细合计不符");Require(parts.Count>0,"没有工资项目");var expected=earnings-parts.Where(x=>x.Kind=="Deduction").Sum(x=>Money(x.Amount));Require(expected>=0,"实发工资不可为负");if(Field(row,"net")!="")Require(expected==Amount("net"),"实发金额与应发减扣款不符");
                slip=new(month,payDate,employer.Name,b.Currency,parts.ToArray(),employment.Id,null,employment.AccountId,$"Import: {job.FileName}");
                // Source-independent fingerprint prevents the same row being saved from another file.
                var canonical=JsonSerializer.Serialize(new{employment.Id,month,payDate,b.Currency,parts},Json);hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
                Require(seen.Add(hash),"文件内重复工资记录");Require(!await db.Set<PayrollStatement>().AnyAsync(x=>x.UserId==user && x.ImportRowKey==hash),"该工资记录已导入");
            }catch(ApiException ex){issues.Add(ex.Message);}catch(FormatException){issues.Add("数据格式无效");}
            preview.Add(new(pair.index+1,slip,hash,issues.ToArray()));
        }
        job.MappingJson=JsonSerializer.Serialize(b,Json);job.RowsJson=JsonSerializer.Serialize(rows,Json);job.PreviewJson=JsonSerializer.Serialize(preview,Json);job.State="Previewed";job.Version++;job.UpdatedAt=DateTimeOffset.UtcNow;return new{job.Id,version=job.Version.ToString(),preview,valid=preview.Count(x=>x.Issues.Length==0)};
    }
    public async Task<object> PayrollImportSave(string user,string id,string? version) {
        var job=await PayOwned<PayrollImportJob>(user,id);Version(job,version);Require(job.State=="Previewed","请先预览并确认");var rows=JsonSerializer.Deserialize<PayrollImportRow[]>(job.PreviewJson,Json)!;Require(rows.Length>0 && rows.All(x=>x.Issues.Length==0 && x.Slip!=null),"请修正所有错误后再保存");
        var ids=new List<string>();foreach(var row in rows){Require(!await db.Set<PayrollStatement>().AnyAsync(x=>x.UserId==user && x.ImportRowKey==row.Fingerprint),"检测到重复导入，请重新预览");var result=JsonSerializer.SerializeToElement(await PayrollCenterSave(user,row.Slip!,null,null),Json);var slipId=result.GetProperty("id").GetString()!;var slip=db.Set<PayrollStatement>().Local.Single(x=>x.Id==slipId);slip.ImportJobId=job.Id;slip.ImportRowKey=row.Fingerprint;ids.Add(slipId);}
        job.State="Committed";job.Imported=ids.Count;job.Version++;job.UpdatedAt=DateTimeOffset.UtcNow;return new{job.Id,job.Imported,ids,version=job.Version.ToString(),cashImpact="0.00"};
    }
    public async Task<object> PayrollAttachmentSave(string user,string id,IFormFile file) {
        var p=await PayrollEntity(user,id);Require(p.State is not ("Cancelled" or "Voided"),"作废工资条不能增加附件");Require(file.Length is >0 and <=10*1024*1024,"附件须小于10MB");using var stream=new MemoryStream();await file.CopyToAsync(stream);var bytes=stream.ToArray();var png=bytes.Length>8 && bytes.Take(8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10});var jpg=bytes.Length>3 && bytes[0]==255 && bytes[1]==216 && bytes[2]==255;var pdf=bytes.Length>5 && Encoding.ASCII.GetString(bytes,0,5)=="%PDF-";Require(png || jpg || pdf,"附件仅支持PNG、JPG或PDF");
        var x=new StoredDocument{UserId=user,PayrollId=p.Id,Kind="PayrollAttachment",Name=Text(Path.GetFileName(file.FileName),200,true),Content=bytes,ContentType=png?"image/png":jpg?"image/jpeg":"application/pdf"};db.Add(x);return new{x.Id,x.Name};
    }
    public async Task<StoredDocument> PayrollDocument(string user,string id) {var x=await PayOwned<StoredDocument>(user,id);Require(x.Kind is "PayrollAttachment" or "PayrollSource","文件不属于薪酬模块");return x;}
}
