using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
[Collection("Finance SQL")]
public sealed class CurrencyWorkflowTests
{
    private static JsonElement Data(object data)=>JsonSerializer.SerializeToElement(data,FinanceService.Json);
    [DeletionSqlFact] public async Task NewCurrenciesAccountsTransactionsAndHistoricalFxKeepLedgerConsistent() {
        await using var f=new DeletionSqlTests.Fixture();await f.Initialize();
        var account=Data(await f.Service.SaveAccount(f.User,new SaveAccount("Euro bank","Bank","EUR"),null,null));await f.Db.SaveChangesAsync();var id=account.GetProperty("id").GetString()!;
        var root=new Category{UserId=f.User,Name="Euro root",Kind="Expense"};var category=new Category{UserId=f.User,Name="Euro food",Kind="Expense",ParentId=root.Id};f.Db.AddRange(root,category);await f.Db.SaveChangesAsync();
        var input=new SaveTransaction("Expense","12.34",id,DateTimeOffset.UtcNow,CategoryId:category.Id,Currency:"EUR");
        var saved=Data(await f.Service.SaveTransaction(f.User,input));await f.Db.SaveChangesAsync();
        Assert.Equal("EUR",(await f.Db.Transactions.SingleAsync(x=>x.Id==saved.GetProperty("id").GetString())).Currency);Assert.Equal(-12.34m,await f.Service.Balance(f.User,id));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveTransaction(f.User,input with{Currency="USD"}));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveAccount(f.User,new SaveAccount("Bad","Bank","BAD"),null,null));
        await f.Service.SaveFxValuation(f.User,new FxValuationInput("EUR","CNY","7.5",DateOnly.FromDateTime(DateTime.UtcNow.AddDays(-1)),"Verified reference"));await f.Db.SaveChangesAsync();Assert.Equal(-12.34m,await f.Service.Balance(f.User,id));
        var catalog=Data(await f.Service.CurrencyCatalog(f.User));Assert.Equal(32,catalog.GetArrayLength());Assert.True(catalog.EnumerateArray().Single(x=>x.GetProperty("code").GetString()=="EUR").GetProperty("historicalUse").GetBoolean());
        var user=await f.Db.Users.SingleAsync(x=>x.Id==f.User);user.PreferredCurrency="EUR";await f.Db.SaveChangesAsync();
        var dashboard=Data(await f.Service.Dashboard(f.User,DateTimeOffset.UtcNow.AddHours(8).ToString("yyyy-MM")));Assert.Equal("EUR",dashboard.GetProperty("currency").GetString());Assert.Equal("12.34",dashboard.GetProperty("expense").GetString());
        var yen=Data(await f.Service.SaveAccount(f.User,new SaveAccount("Yen bank","Bank","JPY"),null,null));await f.Db.SaveChangesAsync();var yenId=yen.GetProperty("id").GetString()!;
        await f.Service.SaveTransaction(f.User,new SaveTransaction("Transfer","10",id,DateTimeOffset.UtcNow,ToAccountId:yenId,ReceivedAmount:"1680",ExchangeRate:"168",Currency:"EUR"));await f.Db.SaveChangesAsync();Assert.Equal(-22.34m,await f.Service.Balance(f.User,id));Assert.Equal(1680m,await f.Service.Balance(f.User,yenId));
        await f.Service.SaveTransaction(f.User,new SaveTransaction("Transfer","1",id,DateTimeOffset.UtcNow,ToAccountId:yenId,ReceivedAmount:"0.01",ExchangeRate:"0.005",Currency:"EUR"));await f.Db.SaveChangesAsync();Assert.Equal(1680.01m,await f.Service.Balance(f.User,yenId));
        await f.Service.SaveCurrencyPreference(f.User,"JPY",new CurrencyPreferenceInput("日元",false,5),"0");await f.Db.SaveChangesAsync();await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveAccount(f.User,new SaveAccount("Disabled yen","Bank","JPY"),null,null));
        await Assert.ThrowsAsync<ApiException>(()=>f.Service.SaveCurrencyPreference(f.User,"EUR",new CurrencyPreferenceInput("欧元",false,3),"0"));
    }

    [DeletionSqlFact] public async Task DefaultCurrencyProfilePersistsSupportedCurrencyWithVersionProtection() {
        await using var db=new PersonalFinance.Api.Infrastructure.FinanceDb(new DbContextOptionsBuilder<PersonalFinance.Api.Infrastructure.FinanceDb>().UseSqlServer(IsolatedSqlTestDatabase.ConnectionString()).Options);
        await db.Database.MigrateAsync();var user=new AppUser{Email=Guid.NewGuid().ToString()+"@currency.test",PasswordHash="no-login",DisplayName="Currency test"};db.Add(user);await db.SaveChangesAsync();
        var auth=new AuthService(db,new Microsoft.Extensions.Configuration.ConfigurationBuilder().Build());
        var context=new Microsoft.AspNetCore.Http.DefaultHttpContext();context.Request.Headers.IfMatch=user.ProfileVersion.ToString();
        var input=new ProfileInput("Currency test","","",null,"Unspecified","","","","","","zh-CN","Asia/Shanghai","EUR");
        await auth.UpdateProfile(user.Id,input,context);
        Assert.Equal("EUR",(await db.Users.AsNoTracking().SingleAsync(x=>x.Id==user.Id)).PreferredCurrency);
        await Assert.ThrowsAsync<ApiException>(()=>auth.UpdateProfile(user.Id,input with{PreferredCurrency="JPY"},context));
        context.Request.Headers.IfMatch=user.ProfileVersion.ToString();await auth.UpdateProfile(user.Id,input with{PreferredCurrency="JPY"},context);
        Assert.Equal("JPY",(await db.Users.AsNoTracking().SingleAsync(x=>x.Id==user.Id)).PreferredCurrency);
    }
}
