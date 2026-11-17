using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> FestivalAnnual(string user,int year) {
        Require(year is >=1901 and <=2100,"年份无效");
        var docs=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind==FestivalKind).OrderBy(x=>x.Id).Take(2001).ToArrayAsync();Require(docs.Length<=2000,"节日超过2000个，请归档后查询");
        var selected=docs.Where(x=>FestivalRead(x).StartsOn.Year==year).ToArray();var items=new List<object>();var reportData=await FestivalLoadReports(user);
        foreach(var d in selected) items.Add(new {document=FestivalDto(d),report=await FestivalReport(user,d,reportData)});
        return new {year,items,scope="按节日开始日期年份归集，币种分别展示；跨月消费按节日实例汇总，不改变月度支出"};
    }
    public async Task<object> FestivalRecipientSave(string user,string? id,FestivalRecipient b,string? version) {
        Require(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length<=100 && b.Relationship.Length<=100 && b.Preferences.Length<=2000 && b.Avoid.Length<=2000 && CurrencyDefinitions.Supports(b.Currency) && FestivalRules.Amount(b.MinBudget)<=FestivalRules.Amount(b.MaxBudget),"送礼对象信息无效");
        var d=id==null ? new StoredDocument {UserId=user,Kind="FestivalRecipient",ContentType="application/json"} : await Document(user,id,"FestivalRecipient");
        if(id==null){Require(version=="0","新档案版本须为0");db.Add(d);}else{Version(d,version);d.Version++;}
        d.Name=b.Name;d.Content=JsonSerializer.SerializeToUtf8Bytes(b,Json);return new {d.Id,version=d.Version.ToString(),input=b};
    }
    public async Task<object> FestivalRecipients(string user) => (await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind=="FestivalRecipient").OrderBy(x=>x.Name).Take(500).ToArrayAsync()).Select(x=>new{x.Id,version=x.Version.ToString(),input=JsonSerializer.Deserialize<FestivalRecipient>(x.Content,Json)});
    public async Task<object[]> FestivalReminders(string user) {
        var today=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime);
        var docs=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind==FestivalKind).OrderByDescending(x=>x.CreatedAt).Take(2000).ToArrayAsync();
        return docs.Select(d=>(Doc:d,Input:FestivalRead(d))).Where(x=>!x.Input.Hidden && x.Input.State is not ("Cancelled" or "Completed") && (x.Input.ReminderDays??[30,7,0]).Contains(x.Input.StartsOn.DayNumber-today.DayNumber))
            .Select(x=>(object)new {id="festival:"+x.Doc.Id+":"+today.ToString("yyyy-MM-dd"),name=x.Input.Name,at=new DateTimeOffset(x.Input.StartsOn.ToDateTime(TimeOnly.MinValue),TimeSpan.FromHours(8)),currency=x.Input.Currency,amount=x.Input.Budget,source="Festival",missingBudget=Money(x.Input.Budget)==0,pendingPurchases=x.Input.Purchases.Count(p=>p.State is not ("Purchased" or "Delivered" or "Cancelled" or "Returned"))}).ToArray();
    }
}

