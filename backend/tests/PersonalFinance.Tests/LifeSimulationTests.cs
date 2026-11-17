using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;

namespace PersonalFinance.Tests;
public class LifeSimulationTests
{
    public static LifeInput Basic() => new("Test", new(2026, 1, 1), 12, "CNY", 10000, 0, 0, 0, 8000, 5000, 0, 0, 0, 0, 0, 0, 0, [], [], [], "Explicit test assumptions");
    [Fact] public void SavingsProduces46000() { var r = LifeSimulationEngine.Run(Basic()); Assert.Equal(46000, r.Months[^1].ClosingCash); Assert.Equal(13000, r.Months[0].ClosingCash); }
    [Fact] public void InternalTransferDoesNotChangeWealth() { var b = Basic() with { Events = [new("1", "Transfer", "Transfer", new(2026, 1, 1), 10000)] }; Assert.Equal(LifeSimulationEngine.Run(Basic()).FinalNetWorth, LifeSimulationEngine.Run(b).FinalNetWorth); }
    [Fact] public void PrincipalReducesCashAndDebtEqually()
    {
        var b = Basic() with { MonthlyIncome = 0, MonthlyExpense = 0, Loans = [new("loan", 10000, 0, 12, new(2027, 1, 1))], Events = [new("1", "Repay", "Repay", new(2026, 1, 1), 10000, LoanId: "loan")] };
        var r = LifeSimulationEngine.Run(b); Assert.Equal(0, r.FinalNetWorth); Assert.Equal(0, r.Months[0].Debt); Assert.Equal(0, r.Months[0].ClosingCash);
    }
    [Fact] public void BuyingHousePreservesWealth()
    {
        var b = Basic() with { Cash = 200000, MonthlyIncome = 0, MonthlyExpense = 0, Months = 1, Loans = [new("mortgage", 800000, 0, 360, new(2026, 2, 1))], Events = [new("1", "Mortgage", "Borrow", new(2026, 1, 1), 800000, LoanId: "mortgage"), new("2", "House", "BuyAsset", new(2026, 1, 1), 1000000)] };
        var r = LifeSimulationEngine.Run(b); Assert.Equal(200000, r.FinalNetWorth); Assert.Equal(0, r.Months[0].ClosingCash); Assert.Equal(1000000, r.Months[0].OtherAssets); Assert.Equal(800000, r.Months[0].Debt);
    }
    [Fact] public void InflationDeflatesAnnually() { var r = LifeSimulationEngine.Run(Basic() with { Cash = 103000, MonthlyIncome = 0, MonthlyExpense = 0, Inflation = .03m }); Assert.Equal(100000, r.Months[^1].RealNetWorth); }
    [Fact] public void RetirementExhaustionHasNoOffset() { var r = LifeSimulationEngine.Run(Basic() with { Cash = 10000, MonthlyIncome = 0, MonthlyExpense = 2000 }); Assert.Equal(new DateOnly(2026, 6, 1), r.FirstShortfall); Assert.Equal(-14000, r.MinimumCash); Assert.Equal(0, r.Months[4].ClosingCash); }
    [Fact] public void InvestmentContributionIsNotExpense() { var r = LifeSimulationEngine.Run(Basic() with { MonthlyIncome = 0, MonthlyExpense = 0, Events = [new("1", "Invest", "Invest", new(2026, 1, 1), 5000)] }); Assert.Equal(10000, r.FinalNetWorth); Assert.Equal(0, r.TotalExpense); }
    [Fact] public void SaleRecognizesOnlyGainAndDoesNotDoubleValue() { var r = LifeSimulationEngine.Run(Basic() with { OtherAssets = 10000, MonthlyIncome = 0, MonthlyExpense = 0, Events = [new("1", "Sell", "SellAsset", new(2026, 1, 2), 12000, Basis: 10000)] }); Assert.Equal(22000, r.FinalNetWorth); Assert.Equal(0, r.Months[0].OtherAssets); Assert.Equal(2000, r.Months[0].ValuationChange); Assert.Equal(0, r.TotalIncome); }
    [Fact] public void RecurrenceUsesCalendarAndInclusiveEnd() { var b = Basic() with { Start = new(2024, 1, 31), MonthlyIncome = 0, MonthlyExpense = 0, Events = [new("1", "Bonus", "Income", new(2024, 1, 31), 100, new(2024, 3, 31), 1)] }; var r = LifeSimulationEngine.Run(b); Assert.Equal(10300, r.FinalNetWorth); Assert.Equal(new DateOnly(2024, 2, 28), r.Months[0].Date); Assert.Equal(100, r.Months[1].Income); }
    [Fact] public void EarlyRepaymentSavesInterest() { var b = Basic() with { Cash = 200000, MonthlyIncome = 0, MonthlyExpense = 0, Loans = [new("loan", 100000, .06m, 12, new(2026, 2, 1))] }; var normal = LifeSimulationEngine.Run(b); var early = LifeSimulationEngine.Run(b with { Events = [new("1", "Repay", "Repay", new(2026, 1, 1), 100000, LoanId: "loan")] }); Assert.True(early.TotalInterest < normal.TotalInterest); Assert.Equal(0, early.TotalInterest); Assert.Equal(100000, early.FinalNetWorth); }
    [Fact] public void UnemploymentResumesOnExplicitDate() { var r = LifeSimulationEngine.Run(Basic() with { Events = [new("1", "Stop", "IncomeChange", new(2026, 1, 1), 0), new("2", "Resume", "IncomeChange", new(2026, 7, 1), 8000)] }); Assert.Equal(-2000, r.Months[^1].ClosingCash); Assert.Equal(new DateOnly(2026, 3, 1), r.FirstShortfall); }
    [Fact] public void FxUsesExplicitRate() { var r = LifeSimulationEngine.Run(Basic() with { Events = [new("1", "USD income", "Income", new(2026, 1, 1), 100, Currency: "USD", FxRate: 7)] }); Assert.Equal(46700, r.FinalNetWorth); }
    [Fact] public void RepeatedInputHasSameFingerprint() { var a = LifeSimulationEngine.Run(Basic()); var b = LifeSimulationEngine.Run(Basic()); Assert.Equal(a.Fingerprint, b.Fingerprint); Assert.Equal(a.Months, b.Months); }
    [Fact] public void DuplicateEventsRejected() { var e = new LifeEvent("1", "X", "Expense", new(2026, 1, 1), 1); Assert.Throws<ApiException>(() => LifeSimulationEngine.Run(Basic() with { Events = [e, e] })); }
    [Fact] public void CancellationStopsComputation() { using var c = new CancellationTokenSource(); c.Cancel(); Assert.Throws<OperationCanceledException>(() => LifeSimulationEngine.Run(Basic(), c.Token)); }
    [Fact] public void ValuationDoesNotProduceCash() { var r = LifeSimulationEngine.Run(Basic() with { MonthlyIncome = 0, MonthlyExpense = 0, OtherAssets = 100000, OtherReturn = .1m }); Assert.Equal(10000, r.Months[^1].ClosingCash); Assert.True(r.FinalNetWorth > 110000); }
    [Fact] public void EqualPrincipalExtraPaymentKeepsScheduledPrincipal()
    {
        var b = Basic() with { Cash = 100000, MonthlyIncome = 0, MonthlyExpense = 0, Loans = [new("loan", 12000, .12m, 12, new(2026, 2, 1), "EqualPrincipal")], Events = [new("1", "Extra", "Repay", new(2026, 1, 1), 6000, LoanId: "loan")] };
        var r = LifeSimulationEngine.Run(b); Assert.Equal(1000, r.Months[1].Principal); Assert.Equal(60, r.Months[1].Interest); Assert.Equal(0, r.Months[6].Debt);
    }
    [Fact] public void LowerPaymentKeepsMaturityWhileReducingPayment()
    {
        var b = Basic() with { Cash = 100000, Months = 13, MonthlyIncome = 0, MonthlyExpense = 0, Loans = [new("loan", 12000, 0, 12, new(2026, 2, 1), "EqualPrincipal", "LowerPayment")], Events = [new("1", "Extra", "Repay", new(2026, 1, 1), 6000, LoanId: "loan")] };
        var r = LifeSimulationEngine.Run(b); Assert.Equal(500, r.Months[1].Principal); Assert.Equal(500, r.Months[11].Debt); Assert.Equal(0, r.Months[12].Debt);
    }
    [Fact] public void ExtremeInputsProduceValidationErrorInsteadOfServerOverflow()
    {
        var b = Basic() with { Cash = 1000000000000m, MonthlyIncome = 1000000000000m, IncomeGrowth = .5m, Inflation = -.5m, Months = 480 };
        Assert.Throws<ApiException>(() => LifeSimulationEngine.Run(b));
    }
}
