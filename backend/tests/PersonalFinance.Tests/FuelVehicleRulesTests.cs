using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelVehicleRulesTests
{
    static DateOnly Today => new(2026,10,30);
    static FuelVehicleInput Input => new("Car","plate","Petrol",Brand:"Brand",Model:"Model",ModelYear:2020,EnergyType:"Hybrid",TankCapacity:50,PurchaseDate:new(2020,1,1),PurchaseAmount:100000,PurchaseCurrency:"CNY",InitialOdometer:0,CurrentOdometer:10000,AnnualDistance:12000);
    [Fact] public void FullProfileAndArchiveAreValidWithoutInventingFinancialEntries()
    {
        FuelVehicleRules.Validate(Input,Today);FuelVehicleRules.Validate(Input with {Status="Archived"},Today);
    }
    [Fact] public void HistoricalAndElectricVehiclesCanLeaveUnknownFieldsEmpty()
    {
        FuelVehicleRules.Validate(new("Old","","Petrol"),Today);
        FuelVehicleRules.Validate(new("EV","","Electric",EnergyType:"Electric"),Today);
    }
    [Fact] public void MissingPurchaseCurrencyAndReversedMileageAreRejected()
    {
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {PurchaseCurrency=null},Today));
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {InitialOdometer=20000},Today));
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {PurchaseCurrency="FAKE"},Today));
    }
    [Theory]
    [InlineData(0,2020,"Active","Petrol")]
    [InlineData(-1,2020,"Active","Petrol")]
    [InlineData(50,1885,"Active","Petrol")]
    [InlineData(50,2028,"Active","Petrol")]
    [InlineData(50,2020,"Deleted","Petrol")]
    [InlineData(50,2020,"Active","Invalid")]
    public void InvalidProfileValuesAreRejected(decimal tank,int year,string status,string energy)
    {
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {TankCapacity=tank,ModelYear=year,Status=status,EnergyType=energy},Today));
    }
    [Fact] public void DatesPrecisionsAndTextAreValidated()
    {
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {PurchaseDate=Today.AddDays(1)},Today));
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {PurchaseAmount=1.001m},Today));
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {CurrentOdometer=1.01m},Today));
        Assert.Throws<ApiException>(()=>FuelVehicleRules.Validate(Input with {Note=new string('x',1001)},Today));
    }
    [Fact] public void LegacyRequestDefaultsPreserveUnknownMetadata()
    {
        var b=JsonSerializer.Deserialize<FuelVehicleInput>("""{"Name":"Car","Plate":"","FuelType":"Petrol"}""")!;
        Assert.Equal("Unknown",b.EnergyType);Assert.Equal("Active",b.Status);Assert.Null(b.PurchaseAmount);FuelVehicleRules.Validate(b,Today);
    }
}
