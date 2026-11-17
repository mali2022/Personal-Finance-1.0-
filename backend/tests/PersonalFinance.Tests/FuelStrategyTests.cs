using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelStrategyTests
{
    static FuelStrategyInput Example => new("Example", "CNY", 40, 8, 7.5m, 10, 5, 10, 8);
    [Fact] public void DiscountPointsAndEntireDetourAreIncludedOnce()
    {
        var r=FuelStrategyMath.Calculate(Example);
        Assert.Equal(320,r.BaselineCost);Assert.Equal(285,r.AlternativeCost);Assert.Equal(.8m,r.DetourLitres);Assert.Equal(6,r.DetourCost);Assert.Equal(29,r.NetSaving);
    }
    [Fact] public void UneconomicalDetourProducesNegativeSaving()
    {
        Assert.Equal(-100, FuelStrategyMath.Calculate(Example with {AlternativePrice=8,Coupon=0,PointsValue=0,ExtraDistance=125,Consumption=10}).NetSaving);
    }
    [Fact] public void NoDetourAndNoDiscountIsSimplePriceDifference()
    {
        Assert.Equal(20,FuelStrategyMath.Calculate(Example with {ExtraDistance=0,Coupon=0,PointsValue=0}).NetSaving);
    }
    [Theory]
    [InlineData(0,8,0,0,0,8)]
    [InlineData(40,-1,0,0,0,8)]
    [InlineData(40,8,301,0,0,8)]
    [InlineData(40,8,200,101,0,8)]
    [InlineData(40,8,-1,0,0,8)]
    [InlineData(40,8,0,0,-1,8)]
    [InlineData(40,8,0,0,0,0)]
    public void InvalidInputsCannotCreateSavings(decimal litres,decimal price,decimal coupon,decimal points,decimal distance,decimal consumption)
    {
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Example with {Litres=litres,BaselinePrice=price,Coupon=coupon,PointsValue=points,ExtraDistance=distance,Consumption=consumption}));
    }
    [Fact] public void CurrencyNameAndPrecisionAreValidated()
    {
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Example with {Currency="FAKE"}));
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Example with {Name=" "}));
        Assert.Throws<ApiException>(()=>FuelStrategyMath.Calculate(Example with {Coupon=.001m}));
    }
    [Fact] public void MoneyUsesHalfUpRoundingOnlyAfterCalculation()
    {
        Assert.Equal(.01m,FuelStrategyMath.Calculate(Example with {Litres=.001m,BaselinePrice=5,AlternativePrice=5,Coupon=0,PointsValue=0,ExtraDistance=0}).BaselineCost);
    }
}
