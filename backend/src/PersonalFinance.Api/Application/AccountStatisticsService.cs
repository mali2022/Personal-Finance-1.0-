using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private async Task<object> AccountOrdinaryTotals(string user,string id,DateTimeOffset start,DateTimeOffset end)
    {
        var a=await Account(user,id,false);
        // Report totals are authoritative. Only transactions funded by this account carry ordinary economic categories.
        var transactions=Range(user,start,end,a.Currency,accountIds:[id]).Where(t=>t.Entries.Any(e=>e.UserId==user&&e.Kind=="Account"&&e.AccountId==id));
        var rules = await Rules(user);
        var expenseEntries = StatisticalExpenses(transactions, rules, [id]);
        var perExpense = from e in expenseEntries join t in transactions on e.TransactionId equals t.Id
            group e by new { t.Id, t.Type } into g select new {
                g.Key.Type, Net = g.Sum(e => e.Amount), Gross = g.Sum(e => e.Amount > 0 ? e.Amount : 0), Refund = -g.Sum(e => e.Amount < 0 ? e.Amount : 0)
            };
        var expenses = await perExpense.GroupBy(_ => 1).Select(g => new {
            Net = g.Sum(x => x.Net), Gross = g.Sum(x => x.Gross), Refund = g.Sum(x => x.Refund),
            Count = g.Count(x => x.Net > 0 && x.Type != "Refund"), RefundCount = g.Count(x => x.Refund > 0)
        }).SingleOrDefaultAsync();
        var perIncome = from e in db.Entries join t in transactions on e.TransactionId equals t.Id where e.Kind == "Income"
            group new { e, t } by new { t.Id, t.AccountId } into g select new { g.Key.AccountId, Amount = -g.Sum(x => x.e.Amount) };
        var incomes = await perIncome.GroupBy(_ => 1).Select(g => new { Amount = g.Sum(x => x.AccountId == id ? x.Amount : 0), Count = g.Count(x => x.Amount > 0) }).SingleOrDefaultAsync();
        var extraAmount = 0m; var extraCount = 0;
        if (rules.IncludeAssetLoss || rules.IncludeDecreasingAdjustments) {
            var extras = await transactions.Where(t => rules.IncludeAssetLoss && t.Type == "AssetLoss" || rules.IncludeDecreasingAdjustments && t.Type == "Adjustment" && t.AdjustmentDirection == "Decrease")
                .GroupBy(_ => 1).Select(g => new { Amount = g.Sum(t => t.Amount), Count = g.Count() }).SingleOrDefaultAsync();
            extraAmount = extras?.Amount ?? 0; extraCount = extras?.Count ?? 0;
        }
        return new { income = M(incomes?.Amount ?? 0), incomeCount = incomes?.Count ?? 0,
            expense = M((expenses?.Net ?? 0) + extraAmount), expenseCount = (expenses?.Count ?? 0) + extraCount,
            originalExpense = M(expenses?.Gross ?? 0), effectiveRefund = M(expenses?.Refund ?? 0), refundCount = expenses?.RefundCount ?? 0 };

    }
    public async Task<object> AccountStatistics(string user,string id,IQueryCollection p)
    {
        var a=await Account(user,id,false);var now=DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8));
        var start=string.IsNullOrEmpty(p["start"])?new DateTimeOffset(1900,1,1,0,0,0,TimeSpan.FromHours(8)):Date(p["start"]!);
        var end=string.IsNullOrEmpty(p["end"])?now:(p["end"].ToString().Length==10?Date(p["end"]!).AddDays(1).AddTicks(-1):Date(p["end"]!));Require(end>=start,"统计日期范围无效");
        var month=Month(now.ToString("yyyy-MM"));
        var actual=db.Transactions.AsNoTracking().Where(t=>t.UserId==user&&t.Status!="Deleted"&&t.Entries.Any(e=>e.UserId==user&&e.Kind=="Account"&&e.AccountId==id));
        var count=await actual.CountAsync();
        var trendStart=Month(now.AddMonths(-5).ToString("yyyy-MM")).start;
        var trendTransactions=Range(user,trendStart,now,a.Currency,accountIds:[id]).Where(t=>t.Entries.Any(e=>e.UserId==user&&e.AccountId==id&&e.Kind=="Account"));
        var trendRules=await Rules(user);
        var trendRows=await (from e in db.Entries join t in trendTransactions on e.TransactionId equals t.Id
            where (e.Kind=="Income" || e.Kind=="Expense" && (trendRules.IncludeFees || (t.FeeCategoryId == null || e.CategoryId != t.FeeCategoryId))) && (e.AccountId??t.AccountId)==id
            group new{e,t} by new{Year=t.OccurredAt.AddHours(8).Year,Month=t.OccurredAt.AddHours(8).Month} into g
            select new{g.Key.Year,g.Key.Month,Income=-g.Sum(x=>x.e.Kind=="Income"?x.e.Amount:0),Expense=g.Sum(x=>x.e.Kind=="Expense"?x.e.Amount:0)}).ToArrayAsync();
        var trendExtras=await trendTransactions.Where(t=>trendRules.IncludeAssetLoss&&t.Type=="AssetLoss"||trendRules.IncludeDecreasingAdjustments&&t.Type=="Adjustment"&&t.AdjustmentDirection=="Decrease")
            .GroupBy(t=>new{Year=t.OccurredAt.AddHours(8).Year,Month=t.OccurredAt.AddHours(8).Month}).Select(g=>new{g.Key.Year,g.Key.Month,Amount=g.Sum(t=>t.Amount)}).ToArrayAsync();
        var categories=await (from e in StatisticalExpenses(trendTransactions,trendRules,[id]) join c in db.Categories on e.CategoryId equals c.Id group e by new{c.Id,c.Name} into g select new{id=g.Key.Id,name=g.Key.Name,amount=g.Sum(x=>x.Amount)}).OrderByDescending(x=>x.amount).Take(10).ToArrayAsync();
        return new{a.Currency,selected=await AccountOrdinaryTotals(user,id,start,end),allTime=await AccountOrdinaryTotals(user,id,new DateTimeOffset(1900,1,1,0,0,0,TimeSpan.FromHours(8)),now),
            monthly=Enumerable.Range(0,6).Select(i=>{var monthDate=trendStart.AddMonths(i).ToOffset(TimeSpan.FromHours(8));var row=trendRows.SingleOrDefault(x=>x.Year==monthDate.Year&&x.Month==monthDate.Month);var extra=trendExtras.SingleOrDefault(x=>x.Year==monthDate.Year&&x.Month==monthDate.Month);return new{period=monthDate.ToString("yyyy-MM"),income=M(row?.Income??0),expense=M((row?.Expense??0)+(extra?.Amount??0))};}),
            majorExpenseCategories=categories.Select(x=>new{x.id,x.name,amount=M(x.amount)}),
            thisMonth=await AccountOrdinaryTotals(user,id,month.start,month.end),firstTransactionAt=await actual.MinAsync(t=>(DateTimeOffset?)t.OccurredAt),lastTransactionAt=await actual.MaxAsync(t=>(DateTimeOffset?)t.OccurredAt),
            historicalTransactionCount=await db.Transactions.CountAsync(t=>t.UserId==user&&(t.AccountId==id||t.ToAccountId==id||t.Entries.Any(e=>e.UserId==user&&e.AccountId==id))),actualActivityCount=count,explanation="累计普通收支不等于账户全部资金流水。账户余额由完整账本分录计算。交易笔数按交易ID去重，退款单列；原始支出包括统计规则选中的正费用分录，有效退款按负消费分录计算，手续费沿已有转账及还款规则核算，退款费用需单独登记实际支出；历史交易数包含撤销记录。历史记录缺失不能推断开户前没有交易。"};
    }
    public async Task<object> AccountActivitySummary(string user,string id,IQueryCollection p)
    {
        var a=await Account(user,id,false);
        // A transfer's currency describes its source. Its incoming account entry may use another currency.
        var transactions=db.Transactions.Where(t=>t.UserId==user&&t.Status!="Deleted");
        if(!string.IsNullOrEmpty(p["start"])) {var start=Date(p["start"]!);transactions=transactions.Where(t=>t.OccurredAt>=start);}
        if(!string.IsNullOrEmpty(p["end"])) {var end=Date(p["end"]!).AddDays(1);transactions=transactions.Where(t=>t.OccurredAt<end);}
        var perTransaction=from e in db.Entries join t in transactions on e.TransactionId equals t.Id where e.UserId==user&&e.AccountId==id&&e.Kind=="Account"&&e.Currency==a.Currency
            group e by new{t.Id,t.Type} into g select new{g.Key.Id,g.Key.Type,Amount=g.Sum(e=>e.Amount)};
        var rows=await perTransaction.GroupBy(x=>x.Type).Select(g=>new{type=g.Key,count=g.Count(),inflow=g.Sum(x=>x.Amount>0?x.Amount:0),outflow=-g.Sum(x=>x.Amount<0?x.Amount:0)}).ToArrayAsync();
        var contracts=await db.Businesses.Where(x=>x.UserId==user&&x.ContractAccountId==id).Select(x=>new{x.Id,x.Principal,x.OccurredAt,x.Kind}).ToArrayAsync();
        var ids=contracts.Select(x=>x.Id).ToArray();
        var repayments=db.Transactions.Where(x=>x.UserId==user&&x.Status!="Deleted"&&ids.Contains(x.BusinessId!)&&x.Type=="LoanRepaymentPaid");
        var plans=await db.Set<DebtRepaymentPlan>().Where(x=>x.UserId==user&&(ids.Contains(x.BusinessId!)||x.AccountId==id&&x.Kind=="CreditInstallment")&&x.State=="Active").Select(x=>new{x.Id,x.Name,x.FirstDate,x.Periods,x.RepaymentMode,x.FeeMode,x.PeriodRate,x.ScheduleJson}).ToArrayAsync();
        var planIds=db.Set<DebtRepaymentPlan>().Where(x=>x.UserId==user&&(ids.Contains(x.BusinessId!)||x.AccountId==id&&x.Kind=="CreditInstallment")).Select(x=>x.Id);
        var validCharges=from allocation in db.Set<DebtPaymentAllocation>() join t in db.Transactions on allocation.TransactionId equals t.Id
            where allocation.UserId==user && planIds.Contains(allocation.PlanId) && allocation.State=="Active" && allocation.Component=="Fee" && t.Status!="Deleted"
            && !db.Transactions.Any(r=>r.UserId==user && r.Status!="Deleted" && r.OriginalTransactionId==t.Id)
            group allocation by allocation.FeeNature into g select new{Nature=g.Key,Amount=g.Sum(x=>x.Amount)};
        var charges=await validCharges.ToDictionaryAsync(x=>x.Nature,x=>x.Amount);
        var creditRepayments=from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where t.UserId==user&&t.Status!="Deleted"&&(t.Type=="CreditCardPayment"||t.Type=="Transfer")&&e.Kind=="Account"&&e.AccountId==id&&e.Amount>0 group e by new{t.Id,t.OccurredAt} into g select new{g.Key.Id,g.Key.OccurredAt,Amount=g.Sum(e=>e.Amount)};
        var dates=plans.SelectMany(x=>System.Text.Json.JsonSerializer.Deserialize<DebtScheduleRow[]>(x.ScheduleJson,Json)??[]).Select(x=>x.Date).Order().ToArray();
        return new{a.Currency,items=rows.Select(x=>new{x.type,x.count,inflow=M(x.inflow),outflow=M(x.outflow)}),
            creditConsumption=(a.Type == "CreditCard" || a.Type == "ConsumerCredit")?await AccountOrdinaryTotals(user,id,new DateTimeOffset(1900,1,1,0,0,0,TimeSpan.FromHours(8)),DateTimeOffset.UtcNow):null,
            credit=(a.Type=="CreditCard"||a.Type=="ConsumerCredit")?new{repaymentAmount=M(await creditRepayments.SumAsync(x=>(decimal?)x.Amount)??0),repaymentCount=await creditRepayments.CountAsync(),lastRepaymentAt=await creditRepayments.MaxAsync(x=>(DateTimeOffset?)x.OccurredAt),paidInterest=M(charges.GetValueOrDefault("Interest")),paidServiceFee=M(charges.GetValueOrDefault("ServiceFee")),unclassifiedCharges=M(charges.GetValueOrDefault("Unclassified"))}:null,
            loan=new{contracts=contracts.Select(x=>new{x.Id,principal=M(x.Principal),x.OccurredAt,x.Kind}),principalDisbursed=M(-(await (from e in db.Entries join t in db.Transactions on e.TransactionId equals t.Id where e.AccountId==id&&e.Kind=="Account"&&t.UserId==user&&t.Status!="Deleted"&&t.Type=="LoanReceived" select (decimal?)e.Amount).SumAsync()??0)),
                principalRepaid=M(await repayments.SumAsync(x=>(decimal?)x.Amount)??0),remainingPrincipal=M(Math.Max(0,-await Balance(user,id))),repaymentCount=await repayments.CountAsync(),lastRepaymentAt=await repayments.MaxAsync(x=>(DateTimeOffset?)x.OccurredAt),
                paidInterest=M(charges.GetValueOrDefault("Interest")),paidServiceFee=M(charges.GetValueOrDefault("ServiceFee")),unclassifiedCharges=M(charges.GetValueOrDefault("Unclassified")),
                nextPlannedDate=dates.Where(x=>x>=DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).Date)).Select(x=>(DateOnly?)x).FirstOrDefault(),maturityDate=dates.Select(x=>(DateOnly?)x).LastOrDefault(),plans},
            explanation="资金活动按实际账户分录聚合，包含本金及专项结算，不等同普通收入或支出。贷款本金复用既有Business合同、还款及债务计划。"};
    }
    public async Task<object> AccountHealth(string user,string id)
    {
        var a=await Account(user,id,false);var balance=await Balance(user,id);var now=DateTimeOffset.UtcNow;
        var last=await db.Transactions.Where(x=>x.UserId==user&&x.Status!="Deleted"&&x.Entries.Any(e=>e.UserId==user&&e.AccountId==id&&e.Kind=="Account")).MaxAsync(x=>(DateTimeOffset?)x.OccurredAt);
        var reconcile=await db.Reconciliations.Where(x=>x.UserId==user&&x.AccountId==id).MaxAsync(x=>(DateTimeOffset?)x.CreatedAt);
        var alerts=new List<object>();
        if(last!=null&&last<now.AddDays(-180))alerts.Add(new{code="INACTIVE_180_DAYS",message="超过180天无已记录资金活动；这不代表账户风险"});
        if(!(a.Type == "CreditCard" || a.Type == "ConsumerCredit")&&!(a.Type == "Receivable" || a.Type == "Payable" || a.Type == "ConsumerLoan" || a.Type == "SecuredLoan")&&balance<0)alerts.Add(new{code="NEGATIVE_BALANCE",message="资金账户余额为负，请核对完整分录"});
        if((a.Type == "CreditCard" || a.Type == "ConsumerCredit")&&a.CreditLimit>0&&a.CreditLimit+balance<a.CreditLimit*0.1m)alerts.Add(new{code="LOW_CREDIT",message="可用信用额度低于10%"});
        if(reconcile==null||reconcile<now.AddDays(-90))alerts.Add(new{code="RECONCILIATION_DUE",message="没有近期90天内的对账记录"});
        if(a.Status!="Active"&&(a.IsDefaultIncome||a.IsDefaultExpense))alerts.Add(new{code="DEFAULT_UNAVAILABLE",message="默认账户不可用"});
        if(a.Status!="Active"&&await db.RecurringRules.AnyAsync(x=>x.UserId==user&&x.State=="Active"&&(x.AccountId==id||x.ToAccountId==id)))alerts.Add(new{code="RULE_UNAVAILABLE",message="不可用账户仍被有效周期规则引用"});
        var today=DateOnly.FromDateTime(now.ToOffset(TimeSpan.FromHours(8)).Date);
        if(await db.Set<PaymentInstrument>().AnyAsync(x=>x.UserId==user&&x.AccountId==id&&x.State=="Active"&&x.EndsOn<today))alerts.Add(new{code="AUTHORIZATION_EXPIRED",message="关联付款授权已过期，请核对授权资料"});
        if(AccountKinds.IsLoan(a.Type)&&balance<0)
        {
            var businessIds=db.Businesses.Where(x=>x.UserId==user&&x.ContractAccountId==id).Select(x=>x.Id);
            var schedules=await db.Set<DebtRepaymentPlan>().Where(x=>x.UserId==user&&x.State=="Active"&&businessIds.Contains(x.BusinessId!)).Select(x=>x.ScheduleJson).ToArrayAsync();
            var lastDates=schedules.Select(x=>(System.Text.Json.JsonSerializer.Deserialize<DebtScheduleRow[]>(x,Json)??[]).LastOrDefault()?.Date).Where(x=>x!=null).ToArray();
            if(lastDates.Any(x=>x<=today.AddDays(30)))alerts.Add(new{code="LOAN_MATURITY",message="未偿贷款的有效计划已到期或将于30天内到期；以实际合同为准"});
        }
        return new{alerts,checkedAt=now,automaticStateChanges=false};
    }
}

