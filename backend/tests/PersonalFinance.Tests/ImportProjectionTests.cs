using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class ImportProjectionTests
{
    [Theory]
    [InlineData("Imported")]
    [InlineData("Duplicate")]
    [InlineData("Invalid")]
    public void PersistedStateOverridesLegacyJsonWithoutChangingHistory(string status)
    {
        const string json = "{\"status\":\"Ready\",\"amount\":\"7.00\",\"issues\":[\"需要核实\"]}";
        var row = new ImportRow { Status = status, DataJson = json };
        var dto = FinanceService.ImportRowDto(row);
        Assert.Equal(status, dto["status"]!.GetValue<string>());
        Assert.Equal("7.00", dto["amount"]!.GetValue<string>());
        Assert.Equal("需要核实", dto["issues"]![0]!.GetValue<string>());
        Assert.Equal(json, row.DataJson);
    }
}
