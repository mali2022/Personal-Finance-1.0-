using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public sealed record FinancialReportSelection(string Mode, string Period, string Currency);
public sealed record FinancialReportPreferences(string Currency = "CNY", bool AutoAi = false, bool ReducedMotion = false, bool RedactSharing = true, string Version = "0");
public sealed partial class FinanceService
{
    public async Task<object> FinancialReportCenter(string user, FinancialReportSelection selection, DateTimeOffset? asOf = null)
    {
        Require(selection.Mode is "monthly" or "annual", "报告类型无效");
        Require(CurrencyDefinitions.Supports(selection.Currency), "币种无效");
        var annual = selection.Mode == "annual";
        DateTimeOffset start;
        if (annual) { Require(int.TryParse(selection.Period, out var year) && year is >= 1901 and <= 9997, "年度无效"); start = PlanningYearStart(year); }
        else { start = Month(selection.Period).start; Require(start.Year is >= 1901 and <= 9997, "月份无效"); }
        var now = (asOf ?? DateTimeOffset.UtcNow).ToOffset(TimeSpan.FromHours(8));
        Require(start <= now, "未来期间尚无报告");
        var plannedEnd = annual ? start.AddYears(1) : start.AddMonths(1);
        var end = plannedEnd <= now ? plannedEnd : now;
        var q = Range(user, start, end.AddTicks(-1), selection.Currency);
        var rules = await Rules(user); var totals = await Totals(user, q);
        var expenseEntries = StatisticalExpenses(q, rules);
        var points = await AggregateReportPoints(user, start, end.AddTicks(-1), selection.Currency, annual ? "month" : "day", null);
        
        var openingWorth = await Worth(user, selection.Currency, start.AddTicks(-1)); var closingWorth = await Worth(user, selection.Currency, end.AddTicks(-1));
        var previousStart = annual ? start.AddYears(-1) : start.AddMonths(-1);
        var previousPlannedEnd = annual ? previousStart.AddYears(1) : previousStart.AddMonths(1);
        var previousEnd = plannedEnd <= now ? previousPlannedEnd : previousStart.Add(end - start);
        if (previousEnd > previousPlannedEnd) previousEnd = previousPlannedEnd;
        if (!annual) previousEnd = Ai.AiComparisonWindow.Month(start, now).PreviousEnd;
        var previous = await Totals(user, Range(user, previousStart, previousEnd.AddTicks(-1), selection.Currency));
        var yoyStart = start.AddYears(-1); var yoyPlannedEnd = annual ? yoyStart.AddYears(1) : yoyStart.AddMonths(1);
        var yoyEnd = plannedEnd <= now ? yoyPlannedEnd : yoyStart.Add(end - start); if(yoyEnd > yoyPlannedEnd)yoyEnd = yoyPlannedEnd;
        var yoy = await Totals(user, Range(user, yoyStart, yoyEnd.AddTicks(-1), selection.Currency));
        var catSums = await CategoryExpenseSums(q, rules); var categories = await Categories(user);
        var hierarchy = new CategoryHierarchy(categories);
        System.Text.Json.Nodes.JsonObject? budgetNode = null;
        if(selection.Currency == "CNY") {
            budgetNode = JsonSerializer.SerializeToNode(annual ? await AnnualBudgetDetail(user,start.Year) : await Budget(user,selection.Period), Json)!.AsObject();
            budgetNode["used"] = M(totals.expense);
            if(budgetNode["items"] is System.Text.Json.Nodes.JsonArray lines) foreach(var line in lines) {
                var categoryId=line!["categoryId"]!.GetValue<string>();line["used"]=M(catSums.Where(s=>hierarchy.Contains(categoryId,s.Id)).Sum(s=>s.Amount));
            }
            if(budgetNode["months"] is System.Text.Json.Nodes.JsonArray months) foreach(var month in months) {
                var key=start.Year+"-"+month!["month"]!.GetValue<int>().ToString("00");var point=points.FirstOrDefault(p=>p.Period==key);month["used"]=point?.Expense;
            }
        }
        var categoryRows = categories.Where(c=>c.Kind=="Expense").Select(c => new { c.Id, c.Name, c.ParentId,
            amount = M(catSums.Where(s=>hierarchy.Contains(c.Id,s.Id)).Sum(s=>s.Amount)) }).ToArray();
        var merchants = await (from e in expenseEntries join t in q on e.TransactionId equals t.Id
            group e by t.Merchant ?? "未登记商户" into g select new { name = g.Key, amount = g.Sum(e=>e.Amount) }).OrderByDescending(x=>x.amount).Take(30).ToArrayAsync();
        var tags = await (from tag in db.Set<TransactionTag>() join t in q on tag.TransactionId equals t.Id
            join e in expenseEntries on t.Id equals e.TransactionId
            join d in db.Set<DirectoryItem>().Where(x=>x.UserId==user && x.Kind=="tags") on tag.DirectoryId equals d.Id
            group e by new {d.Id,d.Name} into g select new {g.Key.Id,g.Key.Name,amount=g.Sum(e=>e.Amount)}).OrderByDescending(x=>x.amount).Take(50).ToArrayAsync();
        var flows = await (from e in db.Entries join t in q on e.TransactionId equals t.Id
            where e.Kind=="Income" || e.Kind=="Expense" && (rules.IncludeFees || (t.FeeCategoryId == null || e.CategoryId != t.FeeCategoryId))
            group e by e.AccountId??t.AccountId into g select new {id=g.Key,income=-g.Sum(e=>e.Kind=="Income"?e.Amount:0),expense=g.Sum(e=>e.Kind=="Expense"?e.Amount:0)}).ToArrayAsync();
        var accounts = await db.Accounts.Where(a=>a.UserId==user && a.Currency==selection.Currency).ToArrayAsync();
        async Task<Dictionary<string,decimal>> Balances(DateTimeOffset at) => await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id
            where e.UserId==user && e.Kind=="Account" && t.UserId==user && t.Status!="Deleted" && t.OccurredAt<at
            group e by e.AccountId! into g select new {id=g.Key,amount=g.Sum(x=>x.Amount)}).ToDictionaryAsync(x=>x.id,x=>x.amount);
        var opening = await Balances(start); var closing = await Balances(end);
        var expenseCount = await q.CountAsync(t=>t.Type=="Expense"); var transactionCount = await q.CountAsync();
        var positive = q.Where(t=>t.Type=="Expense" && t.Amount>0);
        var count = await positive.CountAsync(); decimal median=0;
        if(count>0) { var middle=await positive.OrderBy(t=>t.Amount).Skip((count-1)/2).Take(count%2==0?2:1).Select(t=>t.Amount).ToArrayAsync(); median=middle.Average(); }
        var threshold = Math.Max(1000, median*3);
        var large = await positive.OrderByDescending(t=>t.Amount).ThenBy(t=>t.Id).Take(20).Select(t=>new {t.Id,t.Amount,t.OccurredAt,t.Merchant,t.CategoryId}).ToArrayAsync();
        var first = await q.OrderBy(t=>t.OccurredAt).ThenBy(t=>t.Id).Select(t=>new {t.Id,t.OccurredAt,t.Type}).FirstOrDefaultAsync();
        var last = await q.OrderByDescending(t=>t.OccurredAt).ThenBy(t=>t.Id).Select(t=>new {t.Id,t.OccurredAt,t.Type}).FirstOrDefaultAsync();
        var goals = await db.Set<SavingsGoal>().Where(g=>g.UserId==user && g.Currency==selection.Currency && g.StartDate<=DateOnly.FromDateTime(end.Date)).OrderBy(g=>g.Priority).Take(50).ToArrayAsync();
        var allocated = await db.Set<GoalAllocation>().Where(a=>a.UserId==user).GroupBy(a=>a.GoalId).Select(g=>new {id=g.Key,amount=g.Sum(a=>a.Amount)}).ToDictionaryAsync(x=>x.id,x=>x.amount);
        var days = Math.Max(1,(end.Date-start.Date).Days+(plannedEnd>now?1:0));
        decimal cumulativeIncome=0,cumulativeExpense=0;
        return new { schemaVersion=1, selection, generatedAt=DateTimeOffset.UtcNow, start, endExclusive=end, plannedEndExclusive=plannedEnd, isPeriodClosed=plannedEnd<=now,
            metrics=new {income=M(totals.income),expense=M(totals.expense),surplus=M(totals.income-totals.expense),savingsRate=totals.income>0?M((totals.income-totals.expense)/totals.income*100):null,
                transactionCount,expenseCount,elapsedDays=days,dailyExpense=M(totals.expense/days),dailyFrequency=decimal.Round((decimal)expenseCount/days,2),medianExpense=M(median)},
            comparisons=new {previous=new {income=M(previous.income),expense=M(previous.expense),incomeRate=ReviewRateText(totals.income,previous.income),expenseRate=ReviewRateText(totals.expense,previous.expense)},
                yearOverYear=new {income=M(yoy.income),expense=M(yoy.expense),incomeRate=ReviewRateText(totals.income,yoy.income),expenseRate=ReviewRateText(totals.expense,yoy.expense)}},
            points=points.Select(p=>{cumulativeIncome+=PlanningDecimal(p.Income);cumulativeExpense+=PlanningDecimal(p.Expense);return new {p.Period,p.Income,p.Expense,p.Assets,p.Liabilities,p.NetWorth,cumulativeIncome=M(cumulativeIncome),cumulativeExpense=M(cumulativeExpense)};}).ToArray(),
            categories=categoryRows,merchants=merchants.Select(x=>new{x.name,amount=M(x.amount)}),tags=tags.Select(x=>new{x.Id,x.Name,amount=M(x.amount)}),
            accounts=accounts.Select(a=>{var flow=flows.FirstOrDefault(f=>f.id==a.Id);var before=a.OpeningBalance+opening.GetValueOrDefault(a.Id);var after=a.OpeningBalance+closing.GetValueOrDefault(a.Id);return new{a.Id,a.Name,a.Type,income=M(flow?.income??0),expense=M(flow?.expense??0),opening=M(before),closing=M(after),change=M(after-before)};}),
            investmentReturns=await InvestmentReturnEvidence(user,start.ToString("yyyy-MM-dd"),end.AddTicks(-1).ToString("yyyy-MM-dd"),selection.Currency),
            budget=budgetNode,netWorth=new{opening=M(openingWorth.netWorth),closing=M(closingWorth.netWorth),change=M(closingWorth.netWorth-openingWorth.netWorth)},
            goals=goals.Select(g=>new{g.Id,g.Name,target=M(g.Target),allocated=M(allocated.GetValueOrDefault(g.Id)),g.TargetDate,g.State,monthlySaving=M(g.MonthlySaving)}),
            largeTransactions=large.Select(t=>new{t.Id,amount=M(t.Amount),t.OccurredAt,t.Merchant,t.CategoryId,unusual=t.Amount>=threshold}),anomalyThreshold=M(threshold),milestones=new{first,last},
            planning=new{nextYear=start.Year+1,observedMonths=annual?points.Count:1,monthlyIncomeBaseline=M(totals.income/(annual?points.Count:1)),monthlyExpenseBaseline=M(totals.expense/(annual?points.Count:1)),monthlySurplusBaseline=M((totals.income-totals.expense)/(annual?points.Count:1)),monthlyGoalCommitment=M(goals.Sum(g=>g.MonthlySaving)),explanation="以已覆盖自然月计算的历史月均，含未结束月份；当前目标月供仅作规划参考，不代表历史投入或已排程资金。不外推为确定的未来收入，不自动写入预算。"},
            coverage="沿用账本统计开关，转账及借贷本金不算收支，退款按到账日冲减费用。按单币种展示，不合并外币。分类父子层级不可相加；多标签重复归属不可相加。账户收支仅为收支分录，不含统计开关额外计入的资产损失或调减。历史余额缺少期初生效日，资产和负债变化为推算；储蓄目标展示当前进度而非历史快照。未结束期间截至生成时点，对比采用同等已过时长；没有记录不代表真实零消费。异常仅为大于等于 max(1000,3倍本期消费中位数) 的金额提示，不判断原因。预算仅覆盖现有CNY预算。商户前30、标签前50、大额前20、目标前50；零基期的增长率不适用。"
        };
    }
    public async Task<object> ArchiveFinancialReport(string user, FinancialReportSelection selection)
    {
        Require(await db.Documents.CountAsync(x=>x.UserId==user && x.Kind=="FinancialReport")<500,"归档已达500份，请先删除不再需要的报告");
        var content=JsonSerializer.SerializeToUtf8Bytes(await FinancialReportCenter(user,selection),Json);
        var doc=new StoredDocument{UserId=user,Kind="FinancialReport",Name=$"{selection.Mode}-{selection.Period}-{selection.Currency}",ContentType="application/json",Content=content};db.Documents.Add(doc);
        return new {doc.Id,doc.Name,doc.CreatedAt,version=doc.Version.ToString()};
    }
    public async Task<object> FinancialReportArchives(string user,int page)
    {
        Require(page is >=1 and <=10000,"页码无效");var q=db.Documents.AsNoTracking().Where(x=>x.UserId==user&&x.Kind=="FinancialReport");
        return new {items=await q.OrderByDescending(x=>x.CreatedAt).ThenBy(x=>x.Id).Skip((page-1)*20).Take(20).Select(x=>new{x.Id,x.Name,x.CreatedAt,version=x.Version.ToString()}).ToArrayAsync(),total=await q.CountAsync(),page,pageSize=20};
    }
    public async Task<object> FinancialReportArchive(string user,string id) {var doc=await db.Documents.AsNoTracking().SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id&&x.Kind=="FinancialReport")??throw new ApiException(404,"报告不存在");return JsonSerializer.Deserialize<JsonElement>(doc.Content,Json);}
    public async Task<object> DeleteFinancialReportArchive(string user,string id,string? version) {var doc=await db.Documents.SingleOrDefaultAsync(x=>x.UserId==user&&x.Id==id&&x.Kind=="FinancialReport")??throw new ApiException(404,"报告不存在");Version(doc,version);db.Documents.Remove(doc);return new{deleted=true};}
    public async Task<object> ReportPreferences(string user) {var doc=await db.Documents.AsNoTracking().Where(x=>x.UserId==user&&x.Kind=="ReportPreferences").OrderByDescending(x=>x.CreatedAt).FirstOrDefaultAsync();return doc==null?new FinancialReportPreferences():JsonSerializer.Deserialize<FinancialReportPreferences>(doc.Content,Json)! with{Version=doc.Version.ToString()};}
    public async Task<object> SaveReportPreferences(string user,FinancialReportPreferences input) {Require(CurrencyDefinitions.Supports(input.Currency),"币种无效");var doc=await db.Documents.Where(x=>x.UserId==user&&x.Kind=="ReportPreferences").OrderByDescending(x=>x.CreatedAt).FirstOrDefaultAsync();if(doc==null){Require(input.Version=="0","设置版本无效");doc=new(){UserId=user,Kind="ReportPreferences",Name="report-preferences",ContentType="application/json"};db.Documents.Add(doc);}else{Version(doc,input.Version);doc.Version++;}doc.Content=JsonSerializer.SerializeToUtf8Bytes(input,Json);return input with{Version=doc.Version.ToString()};}
}
public static class FinancialReportCenterEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        var r=api.MapGroup("/reports/center");
        r.MapGet("/data",async(string mode,string period,string currency,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FinancialReportCenter(FinanceEndpoints.User(c),new(mode,period,currency))));
        r.MapGet("/archives",async(int? page,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FinancialReportArchives(FinanceEndpoints.User(c),page??1)));
        r.MapPost("/archives",async(FinancialReportSelection b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ArchiveFinancialReport(FinanceEndpoints.User(c),b),true));
        r.MapGet("/archives/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FinancialReportArchive(FinanceEndpoints.User(c),id)));
        r.MapPost("/archives/{id}/delete",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.DeleteFinancialReportArchive(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        r.MapGet("/preferences",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ReportPreferences(FinanceEndpoints.User(c))));
        r.MapPut("/preferences",async(FinancialReportPreferences b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveReportPreferences(FinanceEndpoints.User(c),b),true));
    }
}
