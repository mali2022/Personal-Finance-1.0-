using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class CategoryStatisticsTests
{
    static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, FinanceService.Json);
    [Fact] public void HierarchyRollsUpThreeLevelsAndRejectsCycles()
    {
        Category[] cats = [new() { Id="r" },new() { Id="s",ParentId="r" },new() { Id="t",ParentId="s" }];
        var tree=new CategoryHierarchy(cats);
        Assert.Equal(new[]{"r","s","t"},tree.Path("t").Select(x=>x.Id));
        Assert.Equal("r",tree.Bucket("t",null)); Assert.Equal("s",tree.Bucket("t","r")); Assert.Equal("t",tree.Bucket("t","s"));
        Assert.True(tree.Overlaps(["r","t"])); Assert.False(tree.Overlaps(["t"])); Assert.Equal(3,tree.Descendants("r").Length);
        cats[0].ParentId="t"; Assert.Throws<ApiException>(()=>tree.Path("t"));
    }
    [Fact] public void SummaryCountsSplitTransactionsOnceAndRefundsReduceNet()
    {
        var date=DateTimeOffset.UtcNow;
        var summary=Json(CategoryStatisticsMath.Summary(new[]{
            new CategoryLedgerRow("a","s","Expense",date,"m","bank",30,2),
            new CategoryLedgerRow("a","t","Expense",date,"m","bank",70,3),
            new CategoryLedgerRow("b","t","Refund",date,"m","cash",-20)}));
        Assert.Equal(2,summary.GetProperty("count").GetInt32()); Assert.Equal("80.00",summary.GetProperty("net").GetString());
        Assert.Equal("100.00",summary.GetProperty("average").GetString()); Assert.Equal("100.00",summary.GetProperty("maximum").GetString());
        Assert.Equal("20.00",summary.GetProperty("refunds").GetString()); Assert.Equal("5.00",summary.GetProperty("discount").GetString());
        Assert.Null(CategoryStatisticsMath.Change(10,0)); Assert.Equal(100,CategoryStatisticsMath.Change(20,10));
        var allocation=CategoryStatisticsMath.Allocate(.01m,new(){{"a",1},{"b",1},{"c",1}}); Assert.Equal(.01m,allocation.Values.Sum());
    }
    [DeletionSqlFact] public async Task RealSqlThreeLevelStatisticsBudgetsAndCurrencyIsolation()
    {
        await using var f=new DeletionSqlTests.Fixture(); await f.Initialize();
        async Task<string> Cat(string name,string? parent=null,string kind="Expense") {
            var result=Json(await f.Service.SaveCategory(f.User,new(name,kind,parent),null)); await f.Db.SaveChangesAsync(); return result.GetProperty("id").GetString()!;
        }
        var root=await Cat("分类统计验证"); var second=await Cat("二级",root); var third=await Cat("三级",second); var incomeRoot=await Cat("收入验证",null,"Income"); var income=await Cat("收入二级",incomeRoot,"Income");
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveCategory(f.User,new("四级","Expense",third),null));
        var account=f.Account(); var now=DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)); var start=new DateTimeOffset(now.Year,now.Month,1,0,0,0,TimeSpan.FromHours(8)); var month=start.ToString("yyyy-MM");
        void Tx(string type,DateTimeOffset date,string currency,params (string category,decimal amount)[] splits) {
            var t=new FinanceTransaction {UserId=f.User,Type=type,AccountId=account.Id,CategoryId=splits[0].category,Amount=Math.Abs(splits.Sum(x=>x.amount)),Currency=currency,OccurredAt=date,Merchant="测试商户"};
            foreach(var s in splits) t.Entries.Add(new Entry {UserId=f.User,TransactionId=t.Id,Kind=type=="Income"?"Income":"Expense",CategoryId=s.category,Amount=s.amount,Currency=currency,BaseAmount=s.amount});
            if(type=="Expense"&&date==start) t.PromotionJson=JsonSerializer.Serialize(new PromotionInput("110","CNY",[new("Coupon","10",0)]),FinanceService.Json);
            f.Db.Add(t);
        }
        Tx("Expense",start,"CNY",(second,30),(third,70)); Tx("Refund",start,"CNY",(third,-20));
        Tx("Expense",start.AddMonths(-1),"CNY",(third,40)); Tx("Expense",start.AddYears(-1),"CNY",(third,50));
        Tx("Expense",start,"USD",(third,999)); Tx("Income",start,"CNY",(income,-200));
        await f.Db.SaveChangesAsync();
        await f.Service.SaveBudget(f.User,month,new("1000",[new(root,"500")]),"0"); await f.Db.SaveChangesAsync();
        await f.Service.SaveAnnualBudget(f.User,now.Year,new("1000","CNY","Active",[new(1,null,"1000"),new(0,root,"800")],"三级分类验证"),"0"); await f.Db.SaveChangesAsync();
        var result=Json(await f.Service.CategoryStatistics(f.User,root,"CNY",month));
        Assert.Equal("170.00",result.GetProperty("cumulative").GetProperty("net").GetString());
        Assert.Equal(4,result.GetProperty("cumulative").GetProperty("count").GetInt32());
        Assert.Equal("80.00",result.GetProperty("currentMonth").GetProperty("net").GetString());
        Assert.Equal(100,result.GetProperty("monthOverMonth").GetDecimal()); Assert.Equal(60,result.GetProperty("yearOverYear").GetDecimal());
        Assert.Equal("10.00",result.GetProperty("cumulative").GetProperty("discount").GetString());
        Assert.Equal("500.00",result.GetProperty("budgets").GetProperty("monthly").GetProperty("limit").GetString());
        Assert.Equal("800.00",result.GetProperty("budgets").GetProperty("annual").GetProperty("limit").GetString());
        Assert.Equal(result.GetProperty("currentYear").GetProperty("net").GetString(),Json(await f.Service.AnnualBudgetDetail(f.User,now.Year)).GetProperty("allocations").EnumerateArray().Single(a=>a.GetProperty("month").GetInt32()==0).GetProperty("used").GetString());
        Assert.Equal("80.00",Json(await f.Service.Budget(f.User,month)).GetProperty("items")[0].GetProperty("used").GetString());
        var child=Json(await f.Service.CategoryStatistics(f.User,third,"CNY",month));
        var overview=Json(await f.Service.CategoryOverview(f.User,"CNY")).GetProperty("items").EnumerateArray().ToDictionary(x=>x.GetProperty("id").GetString()!);
        Assert.Equal(result.GetProperty("cumulative").GetRawText(),overview[root].GetProperty("summary").GetRawText());
        Assert.Equal(child.GetProperty("cumulative").GetRawText(),overview[third].GetProperty("summary").GetRawText());
        Assert.Equal(Json(await f.Service.CategoryStatistics(f.User,incomeRoot,"CNY",month)).GetProperty("cumulative").GetRawText(),overview[incomeRoot].GetProperty("summary").GetRawText());
        Assert.Equal("7.00",child.GetProperty("cumulative").GetProperty("discount").GetString());
        Assert.Equal(1,child.GetProperty("budgets").GetProperty("monthly").GetProperty("sharedLines").GetArrayLength());
        Assert.Equal(JsonValueKind.Null,child.GetProperty("budgets").GetProperty("monthly").GetProperty("limit").ValueKind);
        Assert.Equal("200.00",Json(await f.Service.CategoryStatistics(f.User,incomeRoot,"CNY",month)).GetProperty("cumulative").GetProperty("net").GetString());
        Assert.Equal("999.00",Json(await f.Service.CategoryStatistics(f.User,root,"USD",month)).GetProperty("cumulative").GetProperty("net").GetString());
        Assert.Equal(12,result.GetProperty("monthlyTrend").GetArrayLength()); Assert.Single(result.GetProperty("merchants").EnumerateArray());
        var query=new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string,Microsoft.Extensions.Primitives.StringValues>{{"categoryId",root},{"currency","CNY"}});
        Assert.Equal(4,Json(await f.Service.Transactions(f.User,query)).GetProperty("total").GetInt32());
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.CategoryStatistics("another-user",root,"CNY",month));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveAnnualBudget(f.User,now.Year,new("1000","CNY","Active",[new(1,null,"1000"),new(0,root,"500"),new(0,third,"200")],"层级重叠验证"),"1"));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveBudget(f.User,month,new("1000",[new(root,"500"),new(third,"200")]),"1"));
        f.Db.Categories.Single(x=>x.Id==root).Status="Disabled"; await f.Db.SaveChangesAsync();
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveCategory(f.User,new("禁用祖先下","Expense",second),null));
        Assert.False(Json(await f.Service.CategoryStatistics(f.User,third,"CNY",month)).GetProperty("category").GetProperty("effectiveActive").GetBoolean());
        var existing=f.Db.Categories.Single(x=>x.Id==third);
        await f.Service.SaveCategory(f.User,new("停用层级仍可管理","Expense",second),third,existing.Version.ToString()); await f.Db.SaveChangesAsync();
        Assert.Equal("停用层级仍可管理",existing.Name);
    }
}
