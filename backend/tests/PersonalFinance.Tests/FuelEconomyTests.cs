using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelEconomyTests
{
    static FuelStrategyInput Input => new("Economy", "CNY", 40, 8, 7.5m, 0, 0, 0, 8, "Economy", 1000, 15000, 6, 5);
    [Fact] public void MonthlyAnnualAndMultiYearUseTheirOwnDistances()
    {
        var result=FuelStrategyMath.Calculate(Input);
        Assert.Equal(640,result.BaselineCost);Assert.Equal(480,result.AlternativeCost);Assert.Equal(160,result.NetSaving);
        Assert.Equal(9600,result.Economy!.AnnualBaselineCost);Assert.Equal(7200,result.Economy.AnnualTargetCost);
        Assert.Equal(2400,result.Economy.AnnualSaving);Assert.Equal(12000,result.Economy.TotalSaving);
    }
    [Fact] public void SensitivityScalesPriceAndSavingsOnly()
    {
        var r=FuelStrategyMath.Calculate(Input).Economy!;
        Assert.Equal(new[]{6.4m,8m,9.6m},r.Sensitivity.Select(x=>x.FuelPrice));
        Assert.Equal(new[]{1920m,2400m,2880m},r.Sensitivity.Select(x=>x.AnnualSaving));
        Assert.Equal(new[]{9600m,12000m,14400m},r.Sensitivity.Select(x=>x.TotalSaving));
    }
    [Fact] public void EqualOrWorseTargetDoesNotInventSavings()
    {
        Assert.Equal(0,FuelStrategyMath.Calculate(Input with {TargetConsumption=8}).NetSaving);
        Assert.Equal(-160,FuelStrategyMath.Calculate(Input with {TargetConsumption=10}).NetSaving);
        Assert.Equal(0,FuelStrategyMath.Calculate(Input with {MonthlyDistance=0,AnnualDistance=0}).Economy!.TotalSaving);
    }
    [Fact] public void AnnualResultsDoNotMultiplyRoundedMonthlyValues()
    {
        var r=FuelStrategyMath.Calculate(Input with {MonthlyDistance=.1m,AnnualDistance=1.2m,BaselinePrice=1,Consumption=8,TargetConsumption=7});
        Assert.Equal(0,r.NetSaving);Assert.Equal(.01m,r.Economy!.AnnualSaving);Assert.Equal(.06m,r.Economy.TotalSaving);
    }
    [Theory]
    [InlineData(-1,1000,6,1)]
    [InlineData(1000,1200001,6,1)]
    [InlineData(1000,1000,0,1)]
    [InlineData(1000,1000,101,1)]
    [InlineData(1000,1000,6,0)]
    [InlineData(1000,1000,6,51)]
    public void InvalidAssumptionsAreRejected(decimal monthly,decimal annual,decimal target,int years)
    {
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Input with {MonthlyDistance=monthly,AnnualDistance=annual,TargetConsumption=target,Years=years}));
    }
    [Fact] public void UnknownModesAndUnsupportedPrecisionAreRejected()
    {
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Input with {Mode="Fake"}));
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Input with {MonthlyDistance=.01m}));
    }
    [Fact] public void OldSavedStrategiesKeepDetourSemantics()
    {
        var old=JsonSerializer.Deserialize<FuelStrategyInput>("""{"Name":"Old","Currency":"CNY","Litres":40,"BaselinePrice":8,"AlternativePrice":7.5,"Coupon":10,"PointsValue":5,"ExtraDistance":10,"Consumption":8}""")!;
        Assert.Equal("Detour",old.Mode);Assert.Equal(29,FuelStrategyMath.Calculate(old).NetSaving);Assert.Null(FuelStrategyMath.Calculate(old).Economy);
        var restored=JsonSerializer.Deserialize<FuelStrategyInput>(JsonSerializer.Serialize(Input))!;
        Assert.Equal(12000,FuelStrategyMath.Calculate(restored).Economy!.TotalSaving);
    }
}
