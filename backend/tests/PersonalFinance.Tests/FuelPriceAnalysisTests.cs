using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelPriceAnalysisTests
{
    static FuelRecord R(string id, decimal litres, decimal amount, string currency="CNY", string grade="Petrol92", string vehicle="car", string station="Station") => new(){Id=id,VehicleId=vehicle,Date=new(2026,10,1),Litres=litres,Amount=amount,Currency=currency,FuelGrade=grade,Station=station};
    [Fact] public void WeightedPricesAndDailyTrendUseActualPaidAmount()
    {
        var a=R("a",10,60,station:"  Station   ");a.EnteredUnitPrice=99;
        var b=R("b",30,240,station:"STATION");b.QuantitySource="ReferenceSnapshot20261016";
        var group=Assert.Single(FuelPriceAnalysis.Analyze([a,b]));
        Assert.Equal(7.5m,group.WeightedUnitPrice);Assert.Equal(6,group.MinimumUnitPrice);Assert.Equal(8,group.MaximumUnitPrice);
        Assert.Equal(7.5m,Assert.Single(group.Trend).UnitPrice);Assert.Equal(1,group.EstimatedQuantityCount);
        Assert.Equal(new[]{"a","b"},group.RecordIds);Assert.Equal("  Station   ",a.Station);
    }
    [Fact] public void DifferentCurrenciesGradesVehiclesAndStationsNeverMix()
    {
        var groups=FuelPriceAnalysis.Analyze([R("a",10,60),R("b",10,10,"USD"),R("c",10,70,grade:"Petrol95"),R("d",10,90,grade:"Unknown"),R("e",10,80,vehicle:"other"),R("f",10,65,station:"")]);
        Assert.Equal(6,groups.Length);Assert.All(groups,g=>Assert.Equal(1,g.Count));
    }
    [Fact] public void InvalidQuantitiesAreExcludedAndEmptyInputsStayEmpty()
    {
        Assert.Empty(FuelPriceAnalysis.Analyze([]));Assert.Empty(FuelPriceAnalysis.Analyze([R("a",0,10),R("b",-1,10),R("c",1,-10)]));
    }
    [Fact] public void EditAndDeleteAreReflectedWithoutStaleSnapshots()
    {
        var a=R("a",10,60);var b=R("b",10,80);b.Date=new(2026,10,2);
        Assert.Equal(7,Assert.Single(FuelPriceAnalysis.Analyze([a,b])).WeightedUnitPrice);
        b.Amount=100;Assert.Equal(8,Assert.Single(FuelPriceAnalysis.Analyze([a,b])).WeightedUnitPrice);
        Assert.Equal(6,Assert.Single(FuelPriceAnalysis.Analyze([a])).WeightedUnitPrice);
    }
}
