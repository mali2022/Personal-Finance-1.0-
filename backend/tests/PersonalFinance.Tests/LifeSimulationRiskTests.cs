using System.Diagnostics;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
using Xunit.Abstractions;
namespace PersonalFinance.Tests;
public class LifeSimulationRiskTests(ITestOutputHelper output)
{
    [Fact] public void SensitivityGridUsesActualEngineAndBounds()
    {
        var b = LifeSimulationTests.Basic() with { Investments = 10000 };
        var cells = LifeSimulationRisk.Sensitivity(new(b, "InvestmentReturn", [0, .05m], "MonthlyExpense", [5000, 6000]));
        Assert.Equal(4, cells.Length); Assert.Equal(56000, cells[0].NetWorth); Assert.True(cells[2].NetWorth > cells[0].NetWorth); Assert.True(cells[1].NetWorth < cells[0].NetWorth);
        Assert.Throws<ApiException>(() => LifeSimulationRisk.Sensitivity(new(b, "InvestmentReturn", Enumerable.Repeat(0m, 9).ToArray(), "Inflation", Enumerable.Repeat(0m, 9).ToArray())));
    }
    [Fact] public void SeededMonteCarloIsReproducible()
    {
        var b = new LifeMonteCarloInput(LifeSimulationTests.Basic() with { Investments = 50000 }, 30, 20261027, .15m, .01m, .03m, .2m);
        var a = LifeSimulationRisk.MonteCarlo(b); var c = LifeSimulationRisk.MonteCarlo(b);
        Assert.Equal(a.FinalValues, c.FinalValues); Assert.Equal(a.Bands, c.Bands); Assert.All(a.Bands, x => { Assert.True(x.P10 <= x.P50); Assert.True(x.P50 <= x.P90); });
        Assert.NotEqual(a.FinalValues, LifeSimulationRisk.MonteCarlo(b with { Seed = 2 }).FinalValues);
    }
    [Fact] public void ZeroVolatilityMatchesDeterministicNoFees()
    {
        var b = LifeSimulationTests.Basic() with { Investments = 50000, InvestmentReturn = .03m, Inflation = .03m, IncomeGrowth = .03m };
        var r = LifeSimulationRisk.MonteCarlo(new(b, 10, 1, 0, 0, 0, 0));
        Assert.All(r.FinalValues, x => Assert.InRange(x - LifeSimulationEngine.Run(b).FinalNetWorth, -.01m, .01m));
    }
    [Fact] public void MonteCarloResourceBoundsAndCorrelationAreValidated()
    {
        var b = new LifeMonteCarloInput(LifeSimulationTests.Basic(), 501, 1, .1m, 0, 0, 0);
        Assert.Throws<ApiException>(() => LifeSimulationRisk.MonteCarlo(b));
        Assert.Throws<ApiException>(() => LifeSimulationRisk.MonteCarlo(b with { Iterations = 10, Correlation = -.5m }));
    }
    [Fact] public void FortyYearEnginePerformanceIsMeasuredWithoutDatabase()
    {
        var b = LifeSimulationTests.Basic() with { Months = 480, Loans = [new("loan", 100000, .03m, 360, new(2026,2,1))] };
        LifeSimulationEngine.Run(b); var times = new List<double>();
        for (var i = 0; i < 20; i++) { var sw = Stopwatch.StartNew(); LifeSimulationEngine.Run(b); times.Add(sw.Elapsed.TotalMilliseconds); }
        output.WriteLine($"40 year, one loan, 20 runs; P95={times.Order().ElementAt(18):F2}ms; max={times.Max():F2}ms; process={Environment.Version}; CPUs={Environment.ProcessorCount}");
        Assert.True(times.Max() < 5000, "40 year deterministic calculation exceeded requested 5s budget");
    }
}
