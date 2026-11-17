using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class LifeSimulationPrivacyTests
{
    [Theory]
    [InlineData(false, false, false)]
    [InlineData(true, false, false)]
    [InlineData(false, true, false)]
    [InlineData(true, true, true)]
    public void LifeToolRequiresBothSummaryAndPayrollConsent(bool summary, bool payroll, bool allowed)
    {
        var tool = AiFinancialTools.Registry.Single(x => x.Name == "GetLifeSimulation");
        Assert.Equal(allowed, AiFinancialTools.Authorized(tool, new AiPrivacySetting { Enabled = true, AllowSummary = summary, AllowPayroll = payroll }));
        Assert.False(AiFinancialTools.SupportsAccountScope(tool.Name));
    }
}
