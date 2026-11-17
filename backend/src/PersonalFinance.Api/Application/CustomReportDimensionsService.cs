using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
internal sealed record CustomLedgerEntry(string Kind, decimal Amount, string? CategoryId, string Id, string AccountId, string? Merchant, DateTimeOffset OccurredAt, string? ProjectId, string Type, string Currency);
internal sealed record CustomLedgerRow(string key, string label, string income, string expense, int count, string average, string surplus);
public sealed partial class FinanceService
{
    private async Task<CustomLedgerRow[]> CustomLedgerGroups(string user, CustomReportInput b, CustomLedgerEntry[] entries)
    {
        var categories = await db.Categories.AsNoTracking().Where(x=>x.UserId==user).ToDictionaryAsync(x=>x.Id);
        var hierarchy = new CategoryHierarchy(categories.Values);
        var names = categories.ToDictionary(x=>x.Key,x=>x.Value.Name);
        foreach(var account in await db.Accounts.AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync()) names[account.Id]=account.Name;
        foreach(var item in await db.Directory.AsNoTracking().Where(x=>x.UserId==user).ToArrayAsync()) names[item.Id]=item.Name;
        var ids=entries.Select(x=>x.Id).Distinct().ToArray();
        var tags = b.GroupBy=="tag" ? await db.Set<TransactionTag>().Where(x=>ids.Contains(x.TransactionId) && db.Directory.Any(d=>d.UserId==user && d.Id==x.DirectoryId && d.Kind=="tags")).ToArrayAsync() : [];
        var tagGroups=tags.GroupBy(x=>x.TransactionId).ToDictionary(g=>g.Key,g=>g.Select(x=>x.DirectoryId).Distinct().ToArray());
        string[] Keys(CustomLedgerEntry x) => b.GroupBy switch {
            "category"=>[x.CategoryId??"未分类"],
            "parentCategory"=>[x.CategoryId!=null ? hierarchy.Bucket(x.CategoryId,null)??"未分类" : "未分类"],
            "account"=>[x.AccountId], "merchant"=>[x.Merchant??"未登记商户"],
            "project"=>[x.ProjectId??"未登记项目"], "tag"=>tagGroups.GetValueOrDefault(x.Id,["未登记标签"]),
            "type"=>[x.Type], "currency"=>[x.Currency],
            "date"=>[x.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM-dd")],
            "year"=>[x.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy")],
            _=>[x.OccurredAt.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM")]
        };
        return entries.SelectMany(x=>Keys(x).Select(key=>new{key,entry=x})).GroupBy(x=>x.key).Select(g=>{
            var income=-g.Where(x=>x.entry.Kind=="Income").Sum(x=>x.entry.Amount);
            var expense=g.Where(x=>x.entry.Kind=="Expense").Sum(x=>x.entry.Amount);
            var count=g.Select(x=>x.entry.Id).Distinct().Count();
            return new CustomLedgerRow(g.Key,names.GetValueOrDefault(g.Key,g.Key),M(income),M(expense),count,M(expense/count),M(income-expense));
        }).ToArray();
    }
    private async Task<object> CustomBudgetReport(string user, CustomReportInput b)
    {
        Require(b.Currency=="CNY", "现有月度预算以CNY计量，不支持折算执行率");
        Require(b.AccountId==null && b.CategoryId==null && b.ProjectId==null && b.TagId==null && b.Merchant==null && b.TransactionType==null,"预算执行主题使用完整月度预算，不支持资金流水筛选");
        var first=DateOnly.ParseExact(b.Start,"yyyy-MM-dd",CultureInfo.InvariantCulture);
        var last=DateOnly.ParseExact(b.End,"yyyy-MM-dd",CultureInfo.InvariantCulture);
        Require(first.Day==1 && last==new DateOnly(last.Year,last.Month,1).AddMonths(1).AddDays(-1),"预算报表须选择完整月份边界");
        var rows=new List<object>(); decimal total=0,used=0;
        for(var month=first;month<=last;month=month.AddMonths(1)) {
            var budget=JsonSerializer.SerializeToElement(await Budget(user,month.ToString("yyyy-MM")),Json);
            var limit=decimal.Parse(budget.GetProperty("total").GetString()!,CultureInfo.InvariantCulture); var actual=decimal.Parse(budget.GetProperty("used").GetString()!,CultureInfo.InvariantCulture);
            total+=limit;used+=actual;
            rows.Add(new{key=month.ToString("yyyy-MM"),label=month.ToString("yyyy-MM"),income="0.00",expense=M(actual),count=0,budget=M(limit),used=M(actual),executionPercent=limit==0?null:D(actual/limit*100)});
        }
        return new{b.Start,b.End,b.Currency,b.Theme,b.GroupBy,b.Metrics,income="0.00",expense=M(used),surplus="0.00",budget=M(total),used=M(used),executionPercent=total==0?null:D(used/total*100),rows,scope="复用阶段D月度预算及结转规则；按完整月份计算。零预算执行率为空；负净支出原样保留，不按零截断。"};
    }
}
