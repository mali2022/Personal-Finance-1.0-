using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
using Xunit;
using Microsoft.Extensions.DependencyInjection;

namespace PersonalFinance.Tests;

public partial class ConcertTests
{
    [ProfileSqlFact]
    public async Task InvestmentReturnHttpReadsScopedCashFlowsAndRecalculatesCorrections()
    {
        var connection = IsolatedSqlTestDatabase.ConnectionString();
        await using var db = new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer(connection).Options);
        await db.Database.MigrateAsync();
        var password = "Return-Test-" + Guid.NewGuid().ToString("N");
        AppUser User() { var u = new AppUser { Email = Guid.NewGuid().ToString("N") + "@returns.test", DisplayName = "Returns test" }; u.PasswordHash = new PasswordHasher<AppUser>().HashPassword(u, password); return u; }
        var owner = User(); var other = User();
        var account = new Account { UserId = owner.Id, Name = "Investment test", Type = "Investment", Currency = "CNY" };
        var asset = new InvestmentAsset { UserId = owner.Id, AccountId = account.Id, Name = "Return fixture", Currency = "CNY" };
        var buy = new InvestmentTrade { UserId = owner.Id, AssetId = asset.Id, Type = "Buy", Quantity = 1, Amount = 1000, Date = new(2025,1,1), SettlementDate = new(2025,1,1) };
        var emptyAsset = new InvestmentAsset { UserId = owner.Id, AccountId = account.Id, Name = "Empty comparison fixture", Currency = "CNY" };
        db.AddRange(owner, other, account, asset, emptyAsset, buy); await db.SaveChangesAsync();
        using var factory = new Factory(connection);
        using var client = factory.CreateClient(); using var stranger = factory.CreateClient(); using var anonymous = factory.CreateClient();
        foreach (var (http, user) in new[] { (client, owner), (stranger, other) })
        {
            var login = await Data(await http.PostAsJsonAsync("/api/auth/login", new { email = user.Email, password }));
            http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", login.GetProperty("accessToken").GetString());
        }
        var path = $"/api/investments/assets/{asset.Id}/returns?start=2025-01-01&end=2026-01-01&currency=CNY";
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAsync(path)).StatusCode);
        Assert.Equal("ValuationMissing", (await Data(await client.GetAsync(path))).GetProperty("xirr").GetProperty("status").GetString());
        var value = new InvestmentValuation { UserId = owner.Id, AssetId = asset.Id, Date = new(2026,1,1), Price = 1100 };
        db.Add(value); await db.SaveChangesAsync();
        var result = await Data(await client.GetAsync(path));
        Assert.Equal(.1, result.GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.Equal(2, result.GetProperty("cashFlows").GetArrayLength());
        Assert.Equal(100m, decimal.Parse(result.GetProperty("amounts").GetProperty("totalProfit").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
        Assert.True(result.GetProperty("amounts").GetProperty("reconciled").GetBoolean());
        Assert.Equal(result.GetProperty("calculationId").GetGuid(), (await Data(await client.GetAsync(path))).GetProperty("calculationId").GetGuid());
        // Isolated fixture corrections verify fresh reads; this is not a write-endpoint lifecycle test.
        value.Price = 900; await db.SaveChangesAsync();
        var corrected = await Data(await client.GetAsync(path));
        Assert.Equal(-.1, corrected.GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.NotEqual(result.GetProperty("calculationId").GetGuid(), corrected.GetProperty("calculationId").GetGuid());
        await using (var rollback = await db.Database.BeginTransactionAsync())
        {
            value.Price = 800;
            await db.SaveChangesAsync();
            await rollback.RollbackAsync();
        }
        await db.Entry(value).ReloadAsync();
        Assert.Equal(corrected.GetProperty("calculationId").GetGuid(), (await Data(await client.GetAsync(path))).GetProperty("calculationId").GetGuid());
        buy.State = "Revoked"; await db.SaveChangesAsync();
        Assert.Equal("InsufficientData", (await Data(await client.GetAsync(path))).GetProperty("xirr").GetProperty("status").GetString());
        buy.State = "Active"; await db.SaveChangesAsync();
        Assert.Equal(-.1, (await Data(await client.GetAsync(path))).GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        var usdPath = path.Replace("currency=CNY", "currency=USD");
        Assert.Equal("ExchangeRateMissing", (await Data(await client.GetAsync(usdPath))).GetProperty("xirr").GetProperty("status").GetString());
        db.AddRange(new FxValuationRate { UserId = owner.Id, BaseCurrency = "CNY", TargetCurrency = "USD", Date = new(2025,1,1), Rate = .1m, Source = "isolated fixture" },
            new FxValuationRate { UserId = owner.Id, BaseCurrency = "CNY", TargetCurrency = "USD", Date = new(2026,1,1), Rate = .2m, Source = "isolated fixture" });
        await db.SaveChangesAsync();
        var usd = await Data(await client.GetAsync(usdPath));
        Assert.Equal(.8, usd.GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.Equal(80m, decimal.Parse(usd.GetProperty("amounts").GetProperty("reportTotalProfit").GetString()!, System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal("USD", usd.GetProperty("currency").GetString());
        Assert.Equal("0.1", usd.GetProperty("cashFlows")[0].GetProperty("rate").GetString());
        Assert.Equal("isolated fixture", usd.GetProperty("cashFlows")[0].GetProperty("rateSource").GetString());
        Assert.Equal("Success",usd.GetProperty("amounts").GetProperty("exchangeAttribution").GetProperty("status").GetString());
        Assert.Equal(-20m,decimal.Parse(usd.GetProperty("amounts").GetProperty("exchangeAttribution").GetProperty("localProfitAtClosingRate").GetString()!,System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal(100m,decimal.Parse(usd.GetProperty("amounts").GetProperty("exchangeAttribution").GetProperty("cashFlowFxTimingImpact").GetString()!,System.Globalization.CultureInfo.InvariantCulture));
        var concurrent = await Task.WhenAll(Enumerable.Range(0, 4).Select(async _ => await Data(await client.GetAsync(usdPath))));
        Assert.All(concurrent, row => Assert.Equal(.8, row.GetProperty("xirr").GetProperty("rate").GetDouble(), 8));
        var fx = await db.Set<FxValuationRate>().SingleAsync(x => x.UserId == owner.Id && x.Date == new DateOnly(2026,1,1));
        fx.Rate = .1m; await db.SaveChangesAsync();
        var fxCorrected = await Data(await client.GetAsync(usdPath));
        Assert.Equal(-.1, fxCorrected.GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.NotEqual(usd.GetProperty("calculationId").GetGuid(), fxCorrected.GetProperty("calculationId").GetGuid());
        var comparisonInput = new { assetIds = new[] { asset.Id, emptyAsset.Id }, start = "2025-01-01", end = "2026-01-01", currency = "USD" };
        var comparison = await Data(await client.PostAsJsonAsync("/api/investments/returns/compare", comparisonInput));
        Assert.Equal(fxCorrected.GetProperty("calculationId").GetGuid(), comparison.GetProperty("items")[0].GetProperty("calculationId").GetGuid());
        Assert.Equal(-.1, comparison.GetProperty("items")[0].GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.Equal("InsufficientData", comparison.GetProperty("items")[1].GetProperty("xirr").GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync("/api/investments/returns/compare", comparisonInput)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync("/api/investments/returns/compare", new { assetIds = new[] { asset.Id, asset.Id }, start = "2025-01-01", end = "2026-01-01", currency = "USD" })).StatusCode);
        var reportInput = new { name = "Return consistency", start = "2025-01-01", end = "2026-01-01", currency = "USD", theme = "InvestmentReturns", metrics = new[] { "xirrPercent", "totalProfit" } };
        var report = await Data(await client.PostAsJsonAsync("/api/reports/custom/preview", reportInput));
        var reportRow = report.GetProperty("rows").EnumerateArray().Single(x => x.GetProperty("key").GetString() == asset.Id);
        Assert.Equal(fxCorrected.GetProperty("calculationId").GetGuid(), reportRow.GetProperty("calculationId").GetGuid());
        Assert.Equal(-10, double.Parse(reportRow.GetProperty("xirrPercent").GetString()!, System.Globalization.CultureInfo.InvariantCulture), 8);
        Assert.Equal("InsufficientData", report.GetProperty("rows").EnumerateArray().Single(x => x.GetProperty("key").GetString() == emptyAsset.Id).GetProperty("missing").GetString());
        var exported = await Data(await Write(client, "/reports/custom/export", new { definition = reportInput, format = "Excel" }));
        var document = await db.Documents.AsNoTracking().SingleAsync(x => x.UserId == owner.Id && x.Id == exported.GetProperty("id").GetString());
        using (var workbook = new ClosedXML.Excel.XLWorkbook(new MemoryStream(document.Content)))
        {
            Assert.Equal("xirrPercent", workbook.Worksheet(1).Cell(3, 2).GetString());
            Assert.Equal("totalProfit", workbook.Worksheet(1).Cell(3, 3).GetString());
            Assert.Contains("InsufficientData", string.Join("|", workbook.Worksheet(1).RowsUsed().Select(row => row.Cell(5).GetString())));
        }
        var trend = await Data(await client.GetAsync($"/api/investments/assets/{asset.Id}/return-trend?start=2025-01-01&end=2026-01-01&currency=USD"));
        Assert.Equal(13, trend.GetProperty("points").GetArrayLength());
        Assert.Equal("ValuationMissing", trend.GetProperty("points")[0].GetProperty("xirr").GetProperty("status").GetString());
        Assert.Equal(-.1, trend.GetProperty("points")[12].GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        var boundaryInput = new { accountIds = new[] { account.Id }, start = "2025-01-01", end = "2026-01-01", currency = "CNY" };
        Assert.Equal("ValuationMissing", (await Data(await client.PostAsJsonAsync("/api/investments/returns/boundary", boundaryInput))).GetProperty("xirr").GetProperty("status").GetString());
        foreach (var valueInput in new[] { new { accountId = account.Id, date = "2024-12-31", value = "1000", source = "Isolated verified full account", includesCashAndHoldings = true }, new { accountId = account.Id, date = "2026-01-01", value = "1100", source = "Isolated verified full account", includesCashAndHoldings = true } })
            await Data(await Write(client, "/investments/boundary-values", valueInput));
        var boundary = await Data(await client.PostAsJsonAsync("/api/investments/returns/boundary", boundaryInput));
        Assert.Equal(.1, boundary.GetProperty("xirr").GetProperty("rate").GetDouble(), 8);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.PostAsJsonAsync("/api/investments/returns/boundary", boundaryInput)).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await Write(client,"/investments/boundary-values", new { accountId = account.Id, date = "2026-01-01", value = "1100", source = "not confirmed", includesCashAndHoldings = false })).StatusCode);
        var ai = new PersonalFinance.Api.Application.Ai.AiFinancialTools(new PersonalFinance.Api.Application.FinanceService(db, factory.Services.GetRequiredService<Microsoft.Extensions.DependencyInjection.IServiceScopeFactory>(), Microsoft.Extensions.Logging.Abstractions.NullLogger<PersonalFinance.Api.Application.FinanceService>.Instance), Microsoft.Extensions.Options.Options.Create(new PersonalFinance.Api.Application.Ai.AiOptions()));
        var evidence = await ai.Execute(owner.Id,"GetInvestmentPerformance",new("2025-01-01","2026-01-01","CNY",null),default);
        Assert.Contains("Actual/365",evidence.Data!.ToJsonString());
        var emptyEvidence = await ai.Execute(other.Id,"GetInvestmentPerformance",new("2025-01-01","2026-01-01","CNY",null),default);
        Assert.Contains("InsufficientData",emptyEvidence.Data!.ToJsonString());
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.GetAsync(path.Replace("2025-01-01", "invalid"))).StatusCode);
        Assert.Equal(0, await db.Transactions.CountAsync(x => x.UserId == owner.Id));
        var periodic = await Data(await client.PostAsJsonAsync("/api/investments/returns/periodic", new { amounts = new[] { "-100", "60", "60" }, periodsPerYear = 12 }));
        Assert.Equal(.1306623863, periodic.GetProperty("periodReturn").GetProperty("rate").GetDouble(), 8);
        Assert.Equal(Math.Pow(1.1306623862918075,12)-1, periodic.GetProperty("annualizedRate").GetDouble(), 7);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/investments/returns/periodic", new { amounts = new[] { "-100", "110" }, periodsPerYear = 12 })).StatusCode);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, (await client.PostAsJsonAsync("/api/investments/returns/periodic", new { amounts = new[] { "-100", "NaN" }, periodsPerYear = 12 })).StatusCode);
        await using(var writer=await db.Database.BeginTransactionAsync()){
            var resource="finance-user:"+owner.Id;await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=1000; IF @r<0 THROW 51000,'Test writer lock failed',1;");
            value.Price=850;await db.SaveChangesAsync();
            var busy=await client.GetAsync(path);Assert.Equal(HttpStatusCode.ServiceUnavailable,busy.StatusCode);Assert.Contains("INVESTMENT_RETURN_BUSY",await busy.Content.ReadAsStringAsync());
            await writer.RollbackAsync();
        }
        await db.Entry(value).ReloadAsync();Assert.Equal(-.1,(await Data(await client.GetAsync(path))).GetProperty("xirr").GetProperty("rate").GetDouble(),8);
        value.Price=950;await db.SaveChangesAsync();Assert.Equal(-.05,(await Data(await client.GetAsync(path))).GetProperty("xirr").GetProperty("rate").GetDouble(),8);
        var project=new DirectoryItem{UserId=owner.Id,Kind="projects",Name="Explicit investment project"};var foreignProject=new DirectoryItem{UserId=other.Id,Kind="projects",Name="Foreign project"};db.AddRange(project,foreignProject);await db.SaveChangesAsync();
        var assetVersion=(await Data(await client.GetAsync("/api/investments/assets/"+asset.Id))).GetProperty("version").GetString()!;
        var assignment=new {projectId=(string?)project.Id,effectiveFrom="2025-06-01",reason="Whole asset classification, no transaction allocation",classifyWholeAsset=true};
        var savedProject=await Data(await Write(client,$"/investments/assets/{asset.Id}/project",assignment,assetVersion,put:true));
        Assert.Equal("Unassigned",(await Data(await client.GetAsync($"/api/investments/assets/{asset.Id}/project?date=2025-01-01"))).GetProperty("status").GetString());
        Assert.Equal(project.Id,(await Data(await client.GetAsync($"/api/investments/assets/{asset.Id}/project?date=2026-01-01"))).GetProperty("projectId").GetString());
        var projectComparison=await Data(await client.PostAsJsonAsync("/api/investments/returns/compare",comparisonInput));Assert.Equal(project.Id,projectComparison.GetProperty("items")[0].GetProperty("project").GetProperty("projectId").GetString());
        Assert.Equal(HttpStatusCode.Conflict,(await Write(client,$"/investments/assets/{asset.Id}/project",assignment,assetVersion,put:true)).StatusCode);
        var latestVersion=savedProject.GetProperty("version").GetString()!;
        Assert.Equal(HttpStatusCode.NotFound,(await Write(client,$"/investments/assets/{asset.Id}/project",new{projectId=foreignProject.Id,effectiveFrom="2025-06-01",reason="foreign",classifyWholeAsset=true},latestVersion,put:true)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,(await Write(stranger,$"/investments/assets/{asset.Id}/project",assignment,latestVersion,put:true)).StatusCode);
        await Data(await Write(client,$"/investments/assets/{asset.Id}/project",new{projectId=(string?)null,effectiveFrom="2025-06-01",reason="Explicit unassignment correction",classifyWholeAsset=true},latestVersion,put:true));
        Assert.Equal("Unassigned",(await Data(await client.GetAsync($"/api/investments/assets/{asset.Id}/project?date=2026-01-01"))).GetProperty("status").GetString());Assert.Equal(2,await db.Documents.CountAsync(x=>x.UserId==owner.Id&&x.Kind=="InvestmentProjectAssignment"&&x.Name==asset.Id));
        db.Add(new InvestmentTrade{UserId=owner.Id,AssetId=asset.Id,Type="PositionIncrease",Quantity=1,Amount=100,Date=new(2025,6,1),SettlementDate=new(2025,6,1)});await db.SaveChangesAsync();
        Assert.Equal("TransferValuationMissing",(await Data(await client.PostAsJsonAsync("/api/investments/returns/boundary",boundaryInput))).GetProperty("xirr").GetProperty("status").GetString());
        var exited=new InvestmentAsset{UserId=owner.Id,AccountId=account.Id,Name="Exited FX fixture",Currency="CNY"};db.Add(exited);
        db.AddRange(new InvestmentTrade{UserId=owner.Id,AssetId=exited.Id,Type="Buy",Quantity=1,Amount=1000,Date=new(2025,1,1),SettlementDate=new(2025,1,1)},new InvestmentTrade{UserId=owner.Id,AssetId=exited.Id,Type="Sell",Quantity=1,Amount=1100,Date=new(2025,7,1),SettlementDate=new(2025,7,1)},new FxValuationRate{UserId=owner.Id,BaseCurrency="CNY",TargetCurrency="USD",Date=new(2025,7,1),Rate=.1m,Source="Actual exit quote"});await db.SaveChangesAsync();
        var exitedResult=await Data(await client.GetAsync($"/api/investments/assets/{exited.Id}/returns?start=2025-01-01&end=2026-01-02&currency=USD"));
        Assert.Equal("Success",exitedResult.GetProperty("xirr").GetProperty("status").GetString());Assert.Equal("ExchangeRateMissing",exitedResult.GetProperty("amounts").GetProperty("exchangeAttribution").GetProperty("status").GetString());
    }
}
