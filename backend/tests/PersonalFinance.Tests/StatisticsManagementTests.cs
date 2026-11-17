using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
namespace PersonalFinance.Tests;
[Collection("Finance SQL")]
public class StatisticsManagementTests
{
    static JsonElement J(object x) => JsonSerializer.SerializeToElement(x, FinanceService.Json);
    [Theory]
    [InlineData("2024-02-29",31,"month","2024-02-29","2024-03-31")]
    [InlineData("2024-03-01",31,"month","2024-02-29","2024-03-31")]
    [InlineData("2026-10-14",15,"month","2026-09-15","2026-10-15")]
    [InlineData("2026-10-15",15,"month","2026-10-15","2026-11-15")]
    [InlineData("2026-01-02",1,"year","2025-04-01","2026-04-01")]
    [InlineData("2026-10-21",1,"week","2026-10-19","2026-10-26")]
    public void CalendarPeriodsAreContiguousAndUseShanghai(string anchor,int day,string period,string first,string until)
    {
        var (start,end)=FinanceService.StatisticsManagementPeriod(new(MonthStartDay:day,YearStartMonth:4),anchor,period);
        Assert.Equal(first,start.ToString("yyyy-MM-dd")); Assert.Equal(until,end.ToString("yyyy-MM-dd")); Assert.Equal(TimeSpan.FromHours(8),start.Offset);
    }
    [Fact] public void InvalidOptionsAndDatesAreRejected()
    {
        var o=new StatisticsManagementOptions();
        foreach(var invalid in new[]{o with{MonthStartDay=0},o with{MonthStartDay=32},o with{YearStartMonth=13},o with{WeekStartsOn=0},o with{BaseCurrency="XYZ"},o with{Mode="fake"},o with{LargeTransactionThreshold="0"},o with{PayrollBasis="unknown"}})
            Assert.Throws<ApiException>(()=>FinanceService.ValidateStatisticsManagement(invalid));
        Assert.Throws<ApiException>(()=>FinanceService.StatisticsManagementPeriod(o,"2026-02-30","month"));
        Assert.Throws<ApiException>(()=>FinanceService.StatisticsManagementPeriod(o,"2026-10-21","fake"));
    }
    [ProfileSqlFact]
    public async Task SavedPoliciesPreviewActualLedgerWithoutDoubleCountingAndProtectVersions()
    {
        await using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();
        var user=new AppUser{Email=Guid.NewGuid()+"@statistics.test",DisplayName="Statistics"};
        var other=new AppUser{Email=Guid.NewGuid()+"@statistics.test",DisplayName="Other"}; db.AddRange(user,other);
        var bank=new Account{UserId=user.Id,Name="Bank",Type="Bank"};
        var wallet=new Account{UserId=user.Id,Name="Wallet",Type="ElectronicWallet",Status="Archived"};
        var card=new Account{UserId=user.Id,Name="Card",Type="CreditCard"};
        var debtAccount=new Account{UserId=user.Id,Name="Loan",Type="Payable"};
        var investAccount=new Account{UserId=user.Id,Name="Broker",Type="Investment"};
        var expenseCategory=new Category{UserId=user.Id,Name="Food"};
        var feeCategory=new Category{UserId=user.Id,Name="Fee"};
        var salaryCategory=new Category{UserId=user.Id,Name="Salary",Kind="Income"};
        var bonusCategory=new Category{UserId=user.Id,Name="One time",Kind="Income",ParentId=salaryCategory.Id};
        db.AddRange(bank,wallet,card,debtAccount,investAccount,expenseCategory,feeCategory,salaryCategory,bonusCategory,new StatisticsRules{UserId=user.Id});
        DateTimeOffset At(int day)=>new(2026,9,day,12,0,0,TimeSpan.FromHours(8));
        FinanceTransaction Tx(string type,decimal amount,int day=20,string? category=null,string currency="CNY",string status="Confirmed",string? target=null)
        {
            var t=new FinanceTransaction{UserId=user.Id,Type=type,Amount=amount,Currency=currency,Status=status,AccountId=bank.Id,ToAccountId=target,OccurredAt=At(day),CategoryId=category};
            void E(string kind,decimal value,string? account=null,string? cat=null)=>t.Entries.Add(new Entry{UserId=user.Id,Kind=kind,Amount=value,BaseAmount=value,Currency=currency,AccountId=account,CategoryId=cat});
            if(type is "Income" or "Expense" or "Refund") { E(type=="Income"?"Income":"Expense",type=="Expense"?amount:-amount,cat:category); E("Account",type=="Expense"?-amount:amount,bank.Id); }
            else if(type=="LoanReceived") { E("Account",amount,bank.Id); E("Account",-amount,debtAccount.Id); }
            else if(type is "Transfer" or "CreditCardPayment" or "LoanRepaymentPaid") { E("Account",-amount,bank.Id); E("Account",amount,target); }
            else { E("Account",-amount,bank.Id); }
            db.Add(t);return t;
        }
        Tx("Income",10000,category:salaryCategory.Id); Tx("Income",2000,category:bonusCategory.Id);
        var reward=Tx("Income",100,category:salaryCategory.Id); var deposit=Tx("Income",50,category:salaryCategory.Id); var dividend=Tx("Income",20,category:salaryCategory.Id);
        var cost=Tx("Expense",200,category:expenseCategory.Id);cost.FeeCategoryId=feeCategory.Id;cost.Fee=5;
        cost.Entries.Add(new Entry{UserId=user.Id,Kind="Expense",Amount=5,BaseAmount=5,CategoryId=feeCategory.Id});
        cost.Entries.Single(x=>x.Kind=="Account").Amount=-205;cost.Entries.Single(x=>x.Kind=="Account").BaseAmount=-205;
        Tx("Refund",50,category:expenseCategory.Id).OriginalTransactionId=cost.Id;
        Tx("CreditCardPayment",5000,target:card.Id);Tx("Transfer",500,target:wallet.Id);
        Tx("Income",999,1,category:salaryCategory.Id); // Excluded by the custom 15th-to-14th period.
        Tx("Income",999,category:salaryCategory.Id,currency:"USD"); Tx("Income",999,category:salaryCategory.Id,status:"Deleted");Tx("Income",999,category:salaryCategory.Id,status:"NeedsReview");
        var business=new Business{UserId=user.Id,Kind="Borrowed",Principal=2000,AccountId=bank.Id,ContractAccountId=debtAccount.Id,OccurredAt=At(20)};db.Add(business);
        Tx("LoanReceived",2000).BusinessId=business.Id;Tx("LoanRepaymentPaid",300,target:debtAccount.Id).BusinessId=business.Id;
        var revokedBusiness=new Business{UserId=user.Id,Kind="Borrowed",Principal=999,AccountId=bank.Id,ContractAccountId=debtAccount.Id,OccurredAt=At(20)};db.Add(revokedBusiness);
        Tx("LoanReceived",999,status:"Deleted").BusinessId=revokedBusiness.Id;
        var interest=Tx("Expense",25,category:expenseCategory.Id);
        var plan=new DebtRepaymentPlan{UserId=user.Id,Kind="LoanRepayment",AccountId=debtAccount.Id,BusinessId=business.Id,Principal=2000,Periods=1,FirstDate=new(2026,9,25),ScheduleJson=JsonSerializer.Serialize(new[]{new DebtScheduleRow(1,new(2026,9,25),2000,2000,25,0)},FinanceService.Json)};db.Add(plan);
        db.Add(new DebtPaymentAllocation{UserId=user.Id,PlanId=plan.Id,TransactionId=interest.Id,Sequence=1,Component="Fee",FeeNature="Interest",Amount=25});
        db.Add(new DebtPaymentAllocation{UserId=user.Id,PlanId=plan.Id,TransactionId=db.ChangeTracker.Entries<FinanceTransaction>().Single(x=>x.Entity.Type=="LoanRepaymentPaid").Entity.Id,Sequence=1,Component="Principal",Amount=300});
        db.Add(new PromotionTransferDraft{UserId=user.Id,AccountId=bank.Id,ToAccountId=wallet.Id,SubsidyTransactionId=reward.Id,PaidAmount=100,ReceivedAmount=200,SubsidyAmount=100,State="Posted"});
        db.Add(new ManagedAsset{UserId=user.Id,AccountId=bank.Id,InterestTransactionId=deposit.Id,Cost=1000,AcquiredDate=new(2026,1,1)});
        var asset=new InvestmentAsset{UserId=user.Id,AccountId=investAccount.Id,Name="Fund"};db.Add(asset);
        db.Add(new InvestmentTrade{UserId=user.Id,AssetId=asset.Id,Type="Buy",Date=new(2026,8,1),SettlementDate=new(2026,8,1),Quantity=10,Price=100,Amount=1000});
        db.Add(new InvestmentTrade{UserId=user.Id,AssetId=asset.Id,Type="Sell",Date=new(2026,9,20),SettlementDate=new(2026,9,20),Quantity=4,Price=150,Amount=600});
        db.Add(new InvestmentTrade{UserId=user.Id,AssetId=asset.Id,Type="Dividend",Date=new(2026,9,20),SettlementDate=new(2026,9,20),Amount=20,TransactionId=dividend.Id});
        db.Add(new TransactionAnalysisAttribute{UserId=user.Id,CategoryId=salaryCategory.Id,Behavior="FixedIncome"});
        db.Add(new TransactionAnalysisAttribute{UserId=user.Id,CategoryId=bonusCategory.Id,Behavior="OneTimeIncome"});
        var slip=new PayrollStatement{UserId=user.Id,Month="2026-08",PayDate=new(2026,9,20),State="Confirmed"};db.Add(slip);
        db.AddRange(new PayrollComponent{UserId=user.Id,PayrollId=slip.Id,Kind="Earning",Amount=12000},new PayrollComponent{UserId=user.Id,PayrollId=slip.Id,Kind="Deduction",Category="Tax",Amount=1000},new PayrollComponent{UserId=user.Id,PayrollId=slip.Id,Kind="Deduction",Category="HousingFund",Amount=1500});
        await db.SaveChangesAsync();
        using var provider=new ServiceCollection().BuildServiceProvider();var f=new FinanceService(db,provider.GetRequiredService<IServiceScopeFactory>(),NullLogger<FinanceService>.Instance);
        var options=new StatisticsManagementOptions(Mode:"Custom",MonthStartDay:15,IncludeCashRewards:false,IncludeDepositInterest:false,IncludeInvestmentCashIncome:false,IncludeOneTimeIncomeInSavings:false,ShowInvestmentAnalysis:true,ShowWealthAnalysis:true);
        var rules=new RulesInput(true,false,false);
        var result=J(await f.PreviewStatisticsManagement(user.Id,new(options,rules,"2026-09-20")));
        var daily=result.GetProperty("daily"); Assert.Equal("12000.00",daily.GetProperty("income").GetString());Assert.Equal("180.00",daily.GetProperty("netExpense").GetString());Assert.Equal("10000.00",daily.GetProperty("savingsIncome").GetString());Assert.Equal("98.20",daily.GetProperty("savingsRate").GetString());
        Assert.Equal("5000.00",result.GetProperty("debt").GetProperty("cardRepaid").GetString());Assert.Equal("1700.00",result.GetProperty("debt").GetProperty("remainingPrincipal").GetString());Assert.Equal("25.00",result.GetProperty("debt").GetProperty("interest").GetString());
        Assert.Equal("1700.00",result.GetProperty("debt").GetProperty("plannedRemainingPayment").GetString());
        Assert.Equal("14220.00",result.GetProperty("accounts").GetProperty("inflow").GetString());Assert.Equal("5530.00",result.GetProperty("accounts").GetProperty("outflow").GetString());
        Assert.Equal("9500.00",result.GetProperty("payroll").GetProperty("net").GetString());Assert.Equal("200",result.GetProperty("investment").GetProperty("summary").GetProperty("realizedInPeriod").GetString());
        Assert.Equal("25.00",result.GetProperty("debt").GetProperty("months")[0].GetProperty("interest").GetString());
        Assert.False(result.GetProperty("wealth").GetProperty("consolidatedValuation").GetProperty("complete").GetBoolean());
        Assert.False(result.GetProperty("comparison").GetProperty("samePeriod").GetBoolean());Assert.False(db.ChangeTracker.HasChanges());
        var profile=J(await f.StatisticsManagement(user.Id));Assert.Equal("0",profile.GetProperty("version").GetString());
        await f.SaveStatisticsManagement(user.Id,new(options,rules,"1"),"0");await db.SaveChangesAsync();
        var saved=J(await f.StatisticsManagement(user.Id));Assert.Equal(15,saved.GetProperty("options").GetProperty("monthStartDay").GetInt32());
        await Assert.ThrowsAsync<ApiException>(()=>f.SaveStatisticsManagement(user.Id,new(options,rules,"1"),"0"));
        Assert.Equal("0",J(await f.StatisticsManagement(other.Id)).GetProperty("version").GetString());
        Assert.Empty(J(await f.StatisticsManagementHistory(other.Id)).EnumerateArray());
        Assert.NotEmpty(J(await f.StatisticsManagementHistory(user.Id)).EnumerateArray());
        var zero=J(await f.PreviewStatisticsManagement(other.Id,new(new(ShowDebtAnalysis:false,ShowAccountFlows:false),rules,"2026-09-20")));
        Assert.Equal("0.00",zero.GetProperty("daily").GetProperty("income").GetString());Assert.Null(zero.GetProperty("daily").GetProperty("savingsRate").GetString());
        var uncategorized = Tx("Expense",7);
        Tx("Refund",3).OriginalTransactionId=uncategorized.Id;
        await db.SaveChangesAsync();
        var noFees = new RulesInput(false,false,false);
        var retained=J(await f.PreviewStatisticsManagement(user.Id,new(options with{ShowInvestmentAnalysis=false,ShowWealthAnalysis=false},noFees,"2026-09-20")));
        Assert.Equal("179.00",retained.GetProperty("daily").GetProperty("netExpense").GetString());
        Assert.Equal("4.00",retained.GetProperty("quality").GetProperty("unclassifiedExpense").GetString());
        Assert.Equal("179.00",J(await f.PreviewStatisticsPolicy(user.Id,"2026-09","CNY",noFees)).GetProperty("proposedExpense").GetString());
        var globalRules=await db.Rules.SingleAsync(r=>r.UserId==user.Id);globalRules.IncludeFees=false;await db.SaveChangesAsync();
        var query=new Microsoft.AspNetCore.Http.QueryCollection(new Dictionary<string,Microsoft.Extensions.Primitives.StringValues>{["start"]="2026-09-01",["end"]="2026-09-30",["currency"]="CNY",["granularity"]="month"});
        var report=J(await f.Report(user.Id,query));
        Assert.Equal("179.00",report.GetProperty("expense").GetString());
        Assert.Equal("179.00",report.GetProperty("points")[0].GetProperty("expense").GetString());
        Assert.Equal("179.00",J(await f.Budget(user.Id,"2026-09")).GetProperty("used").GetString());
    }
}
