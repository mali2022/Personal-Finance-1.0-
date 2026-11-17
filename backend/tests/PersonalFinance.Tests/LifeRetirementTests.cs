using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class LifeRetirementTests
{
    [Fact] public void RetirementDrawdownHasSameDepletionDateAsCashWithoutReturns()
    {
        var b = LifeSimulationTests.Basic() with { Cash = 0, Investments = 10000, MonthlyIncome = 0, MonthlyExpense = 2000, InvestmentDrawdownFrom = new(2026,1,1) };
        var r = LifeSimulationEngine.Run(b); Assert.Equal(new DateOnly(2026,6,1),r.FirstShortfall); Assert.Equal(0,r.Months[4].Investments); Assert.Equal(-14000,r.MinimumCash); Assert.Equal(-14000,r.FinalNetWorth);
    }
    [Fact] public void InvestmentLiquidationFeeIsExpenseAndPrincipalIsNot()
    {
        var b = LifeSimulationTests.Basic() with { Months = 1, Cash = 0, Investments = 10000, MonthlyIncome = 0, MonthlyExpense = 9000, InvestmentDrawdownFrom = new(2026,1,1), DrawdownFeeRate = .1m };
        var r = LifeSimulationEngine.Run(b); Assert.Null(r.FirstShortfall); Assert.Equal(10000,r.TotalExpense); Assert.Equal(-10000,r.Months[0].InvestmentContribution); Assert.Equal(0,r.FinalNetWorth);
    }
    [Fact] public void HomeEquityDoesNotFundWithdrawals()
    {
        var r = LifeSimulationEngine.Run(LifeSimulationTests.Basic() with { Cash = 0, OtherAssets = 1000000, MonthlyIncome = 0, MonthlyExpense = 1000, InvestmentDrawdownFrom = new(2026,1,1) }); Assert.Equal(new DateOnly(2026,1,1),r.FirstShortfall); Assert.Equal(1000000,r.Months[^1].OtherAssets);
    }
    [Fact] public void DrawdownIsExplicitOptIn()
    {
        var r = LifeSimulationEngine.Run(LifeSimulationTests.Basic() with { Cash = 0, Investments = 10000, MonthlyIncome = 0, MonthlyExpense = 1000 }); Assert.Equal(10000,r.Months[0].Investments); Assert.Equal(new DateOnly(2026,1,1),r.FirstShortfall);
    }
    [Fact] public void OneYearRetirementTargetIsTwelveWithdrawalsAtZeroReturn()
    {
        var b=LifeSimulationTests.Basic() with { Cash = 0, MonthlyIncome = 0, MonthlyExpense = 0 };
        var r=LifeRetirementPlanning.Preview(new(b,60,60,61,1000,0,60)); Assert.InRange(r.AdditionalCapitalToday!.Value,12000,12000.02m); Assert.Equal(r.AdditionalCapitalToday,r.TargetRetirementAssets); Assert.Null(r.AdditionalMonthlySaving);
    }
    [Fact] public void PensionOnPeriodStartCoversSpendingWithoutAnArtificialGap()
    {
        var b=LifeSimulationTests.Basic() with { Cash = 0, MonthlyIncome = 0, MonthlyExpense = 0 };
        var r=LifeRetirementPlanning.Preview(new(b,60,60,61,1000,1000,60)); Assert.Null(r.Result.FirstShortfall); Assert.Equal(0,r.AdditionalCapitalToday); Assert.Equal(12000,r.Result.TotalIncome);
    }
    [Fact] public void UnscheduledDebtDoesNotGetAConfidentFundingTarget()
    {
        var b=LifeSimulationTests.Basic() with { UnscheduledDebt=50000 };
        var r=LifeRetirementPlanning.Preview(new(b,60,60,61,1000,0,60)); Assert.Null(r.TargetRetirementAssets); Assert.Contains("UNSCHEDULED_DEBT_PREVENTS_A_RELIABLE_FUNDING_TARGET",r.Limitations);
    }
    [Fact] public void FullyFundedPlanReportsRequiredFundingRatherThanAllCurrentAssets()
    {
        var b=LifeSimulationTests.Basic() with { Cash=10000, Investments=10000, MonthlyIncome=0, MonthlyExpense=0 };
        var r=LifeRetirementPlanning.Preview(new(b,60,60,61,1000,0,60)); Assert.Equal(20000,r.FinancialAssetsAtRetirement); Assert.Equal(0,r.AdditionalCapitalToday); Assert.InRange(r.TargetRetirementAssets!.Value,12000,12000.02m);
    }
}
