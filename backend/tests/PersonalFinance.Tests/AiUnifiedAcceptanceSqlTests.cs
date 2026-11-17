using Xunit.Abstractions;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public class AiUnifiedAcceptanceSqlTests(ITestOutputHelper output)
{
    [DeletionSqlFact] public async Task FullConsentReadsLongHistoryAndAllRegisteredFinancialQueriesWithoutCrossUserData()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var cash = f.Account(); var expense = f.Expense(cash); expense.OccurredAt = DateTimeOffset.Parse("2018-01-02T12:00:00+08:00");
        var card = f.Account(); card.Name = "Synthetic credit card"; card.Type = "CreditCard"; card.OpeningBalance = -30; card.StatementDay = 15; card.PaymentDay = 25;
        var other = Guid.NewGuid().ToString();
        f.Db.Users.Add(new AppUser { Id = other, Email = other + "@acceptance.test", PasswordHash = "synthetic" });
        f.Db.Accounts.Add(new Account { UserId = other, Name = "PRIVATE_OTHER_USER_SENTINEL", OpeningBalance = 987654321 });
        await f.Db.SaveChangesAsync();
        var snapshot = JsonSerializer.SerializeToElement(await f.Service.CreateLifeSnapshot(f.User, "CNY", default), FinanceService.Json);
        await f.Db.SaveChangesAsync();
        var life = snapshot.GetProperty("snapshot").GetProperty("suggested").Deserialize<LifeInput>(FinanceService.Json)!;
        await f.Service.SaveLifeScenario(f.User, null, life, "0"); await f.Db.SaveChangesAsync();
        var privacy = new AiPrivacyService(f.Db); await privacy.Save(f.User, new(true, false, false, false, false, false, FullFinancialAccess: true, PersonalReadAccess: false), default);
        var p = await privacy.Get(f.User, default);
        var settings = Options.Create(new AiOptions { Enabled = true });
        var tools = new AiFinancialTools(f.Service, settings); var dispatcher = new DeepSeekToolDispatcher(tools, f.Db, settings);
        var context = (await AiRequestContext.Create(f.Db, f.User, null, default)) with { ConsentVersion = p.ConsentVersion };
        var count = await f.Db.Transactions.CountAsync(x => x.UserId == f.User);
        foreach (var spec in AiFinancialTools.Registry) {
            var annual = spec.Name is "GetPayrollSummary" or "GetPayrollCenterSummary" or "GetContributionSummary" or "GetAnnualReview";
            var fields = new Dictionary<string, string> { ["start"] = annual ? "2026-01-01" : "2026-10-01", ["end"] = annual ? "2026-12-31" : "2026-10-31", ["currency"] = "CNY" };
            if (spec.Name == "GetCashFlowForecast") { var today = DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime); fields["start"] = today.ToString("yyyy-MM-dd"); fields["end"] = today.AddDays(30).ToString("yyyy-MM-dd"); }
            if (spec.Name == "GetCreditCardSummary") fields["accountId"] = card.Id;
            if (spec.Name == "GetFundStatus") fields["accountId"] = cash.Id;
            var arguments = JsonSerializer.Serialize(fields, FinanceService.Json);
            var evidence = await dispatcher.Dispatch(f.User, spec.Name, arguments, p, default, context);
            output.WriteLine(JsonSerializer.Serialize(new { tool = spec.Name, evidence.Source, evidence.Data }, FinanceService.Json));
            Assert.Equal(spec.Name, evidence.Tool); Assert.False(string.IsNullOrWhiteSpace(evidence.Source));
            Assert.DoesNotContain("PRIVATE_OTHER_USER_SENTINEL", evidence.Data?.ToJsonString() ?? "");
        }
        var history = await dispatcher.Dispatch(f.User, "GetIncomeExpenseSummary", "{\"start\":\"2018-01-01\",\"end\":\"2026-10-28\",\"currency\":\"CNY\"}", p, default, context);
        Assert.Equal("10.00", history.Data!["expense"]!.GetValue<string>());
        Assert.Equal(count, await f.Db.Transactions.CountAsync(x => x.UserId == f.User));
        await privacy.Save(f.User, new(true, false, false, false, false, false, PersonalReadAccess: false, FullFinancialAccess: false), default);
        Assert.Equal("AI_CONSENT_CHANGED", (await Assert.ThrowsAsync<ApiException>(() => dispatcher.Dispatch(f.User, "GetIncomeExpenseSummary", "{\"start\":\"2018-01-01\",\"end\":\"2026-10-28\",\"currency\":\"CNY\"}", p, default, context))).Code);
        var latest = await privacy.Get(f.User, default); Assert.False(latest.AllowSummary); Assert.False(latest.AllowDetails);
    }
    [DeletionSqlFact] public async Task UnifiedReadConsentIncludesDescriptionsButLegacyReadPermissionDoesNot()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var account = f.Account(); var transaction = f.Expense(account); transaction.Note = "Synthetic private financial note";
        await f.Db.SaveChangesAsync();
        var privacy = new AiPrivacyService(f.Db); await privacy.Save(f.User, new(true,false,false,false,false,false,PersonalReadAccess:false,FullFinancialAccess:true), default);
        var p = await privacy.Get(f.User, default); var options = Options.Create(new AiOptions());
        var tools = new AiAgentTools(f.Db,f.Service,new DeepSeekToolDispatcher(new AiFinancialTools(f.Service,options),f.Db,options));
        var context = await AiRequestContext.Create(f.Db,f.User,null,default);
        var arguments = JsonSerializer.Serialize(new AgentEntity(transaction.Id),FinanceService.Json);
        var full = await tools.Read(f.User,"GetTransactionDetail",arguments,p,context,default);
        Assert.Equal(transaction.Note,full.Data!["note"]!.ToString()); Assert.Equal(transaction.Merchant,full.Data["merchant"]!.ToString());
        await privacy.Save(f.User,new(true,false,true,false,false,false,PersonalReadAccess:false,FullFinancialAccess:false),default);
        var legacy = await tools.Read(f.User,"GetTransactionDetail",arguments,await privacy.Get(f.User,default),context,default);
        Assert.Null(legacy.Data!["note"]); Assert.Null(legacy.Data["merchant"]);
    }
}
