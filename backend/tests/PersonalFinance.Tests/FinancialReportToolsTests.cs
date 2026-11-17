using System.Text.Json;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class FinancialReportToolsTests
{
    private static readonly AiPrivacySetting Allowed = new(){Enabled=true,AllowSummary=true};
    [Theory]
    [InlineData("2025-01-01","2025-12-31")]
    [InlineData("2028-02-01","2028-02-29")]
    public void NaturalPeriodIsAllowed(string start,string end) {
        var query=AiFinancialTools.Validate("GetFinancialReport",JsonSerializer.Serialize(new{start,end,currency="CNY"}),new AiOptions(),Allowed);
        Assert.Equal(start,query.Start);Assert.False(AiFinancialTools.SupportsAccountScope("GetFinancialReport"));
    }
    [Theory]
    [InlineData("2025-01-02","2025-01-31")]
    [InlineData("2025-01-01","2025-02-28")]
    public void ArbitraryRangeIsRejected(string start,string end) => Assert.Throws<ApiException>(()=>AiFinancialTools.Validate("GetFinancialReport",JsonSerializer.Serialize(new{start,end,currency="CNY"}),new AiOptions(),Allowed));
    [Fact] public void UnauthorizedSummaryCannotBeQueried() => Assert.Throws<ApiException>(()=>AiFinancialTools.Validate("GetFinancialReport","{\"start\":\"2025-01-01\",\"end\":\"2025-12-31\",\"currency\":\"CNY\"}",new AiOptions(),new AiPrivacySetting{Enabled=true}));
}
