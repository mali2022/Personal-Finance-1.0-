using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;

public sealed class RequestShapeTests
{
    [Fact]
    public void RequiredNamesAndArraysRejectNullBeforeDomainLogic()
    {
        foreach (var body in new object[] { new SaveAccount(null!, "Cash", "CNY"), new BudgetInput("100", null!), new BudgetInput("100", [null!]), new SaveTransaction("Expense", "1", "account", DateTimeOffset.UtcNow, Payments: [null!]) })
        {
            var error = Assert.Throws<ApiException>(() => RequestShapeFilter.ValidateBody(body)); Assert.Equal(400, error.Status); Assert.Equal("INVALID_REQUEST", error.Code);
        }
    }
    [Fact]
    public void OptionalReferencesAndEmptyCollectionsRemainValid()
    {
        RequestShapeFilter.ValidateBody(new SaveAccount("Cash", "Cash", "CNY", Institution: null, GroupId: null));
        RequestShapeFilter.ValidateBody(new BudgetInput("100", []));
        RequestShapeFilter.ValidateBody(new SaveTransaction("Expense", "1", "account", DateTimeOffset.UtcNow, Payments: null, Note: ""));
        RequestShapeFilter.ValidateBody(new FuelRecordInput("vehicle", new(2026, 1, 1), 10, 10, 10, "CNY", true, false, "", ""));
    }
}
