using System.Globalization;
using System.Text;
using System.Text.Json;
using ClosedXML.Excel;
using CsvHelper;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> ExportCustomReport(string user, CustomReportExportInput b)
    {
        Require(b.Format is "CSV" or "Excel","导出格式无效");
        var result=JsonSerializer.SerializeToElement(await CustomReportPreview(user,b.Definition),Json);
        var rows=result.GetProperty("rows").EnumerateArray().ToArray();Require(rows.Length<=100000,"导出超过明细上限");
        var metrics=b.Definition.Metrics??(b.Definition.Theme switch {"InvestmentReturns"=>["xirrPercent","totalProfit"],"Investment"=>["marketValue","realized","unrealized"],"Assets"=>["amount"],"Budget"=>["budget","used","executionPercent"],_=>new[]{"income","expense","surplus","count","average"}});
        static string Safe(string v)=>v.Length>0 && "=+-@\t\r".Contains(v[0])?"'"+v:v;
        string Cell(JsonElement row,string key)=>!row.TryGetProperty(key,out var value)||value.ValueKind==JsonValueKind.Null?"未覆盖":value.ToString();
        await using var output=new MemoryStream();using var workbook=b.Format=="Excel"?new XLWorkbook():null;
        var sheet=workbook?.Worksheets.Add("自定义报表");using var writer=new StreamWriter(output,new UTF8Encoding(true),leaveOpen:true);using var csv=b.Format=="CSV"?new CsvWriter(writer,CultureInfo.InvariantCulture):null;
        void Row(string[] values,int index){if(csv!=null){foreach(var value in values)csv.WriteField(Safe(value));csv.NextRecord();}else for(var n=0;n<values.Length;n++)sheet!.Cell(index,n+1).Value=values[n];}
        Row(["名称",b.Definition.Name,"起止日期",b.Definition.Start,b.Definition.End,"币种",b.Definition.Currency],1);
        Row(["统计口径",result.GetProperty("scope").GetString()!],2);
        Row(["分组",..metrics,"币种","缺口说明"],3);var index=4;
        foreach(var row in rows)Row([Cell(row,"label"),..metrics.Select(m=>Cell(row,m)),b.Definition.Currency,row.TryGetProperty("missing",out var missing)&&missing.ValueKind!=JsonValueKind.Null?missing.ToString():""],index++);
        if(workbook!=null){sheet!.Columns().AdjustToContents(3,Math.Min(index,1000));sheet.Column(1).Width=Math.Min(sheet.Column(1).Width,45);workbook.SaveAs(output);}else await writer.FlushAsync();
        var doc=new StoredDocument{UserId=user,Kind="Export",Name="custom-report-"+DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")+(b.Format=="CSV"?".csv":".xlsx"),ContentType=b.Format=="CSV"?"text/csv":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",Content=output.ToArray()};
        db.Documents.Add(doc);return new{id=doc.Id,state="Ready",fileName=doc.Name,downloadUrl="/api/exports/"+doc.Id+"/file",total=rows.Length};
    }
}
