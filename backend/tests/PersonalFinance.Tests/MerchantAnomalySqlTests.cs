using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Domain;
using Xunit;

[Collection("Finance SQL")]
public sealed class MerchantAnomalySqlTests
{
    [DeletionSqlFact]
    public async Task MerchantAnomalyDoesNotConfuseOtherUsersKindsOrUnregisteredNames()
    {
        await using var f = new DeletionSqlTests.Fixture(); await f.Initialize();
        var a = f.Account(); f.Expense(a).Merchant = "same-name"; f.Expense(a).Merchant = "free form merchant";
        f.Directory("merchants", "same-name"); f.Directory("projects", "same-name");
        var other = new AppUser { Email = Guid.NewGuid()+"@anomaly.test" };
        f.Db.Add(other); f.Db.Add(new DirectoryItem { UserId=other.Id, Kind="merchants", Name="same-name" });
        await f.Db.SaveChangesAsync();
        var query = new QueryCollection(new Dictionary<string,StringValues> { ["anomaly"]="Merchant" });
        Assert.Empty(await (await f.Service.Filter(f.User, query)).ToArrayAsync());
    }
}
