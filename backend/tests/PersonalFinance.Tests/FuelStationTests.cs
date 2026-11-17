using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelStationTests {
 [Fact] public void AliasesNormalizeWhitespaceAndCaseWithoutDroppingName(){var s=FuelStationRules.Validate(new(" Main station ","Brand","Address",[" old   station ","OLD STATION"]));Assert.Equal(new[]{"MAIN STATION","OLD STATION"},s.Aliases);Assert.Equal("Main station",s.Name);}
 [Fact] public void MappingGroupsPricesWithoutChangingOriginalFacts(){var records=new[]{new FuelRecord{Station="Old station",VehicleId="car",Litres=20,Amount=140,Currency="CNY"},new FuelRecord{Station="New station",VehicleId="car",Litres=30,Amount=240,Currency="CNY"}};var map=new Dictionary<string,string>{{"OLD STATION","Main"},{"NEW STATION","Main"}};var result=Assert.Single(FuelPriceAnalysis.Analyze(records,map));Assert.Equal(7.6m,result.WeightedUnitPrice);Assert.Equal(2,result.Count);Assert.Equal("Old station",records[0].Station);}
 [Fact] public void InvalidStationDataIsRejected(){Assert.Throws<ApiException>(()=>FuelStationRules.Validate(new("","","",[])));Assert.Throws<ApiException>(()=>FuelStationRules.Validate(new("Station","","",[""])));}
}
