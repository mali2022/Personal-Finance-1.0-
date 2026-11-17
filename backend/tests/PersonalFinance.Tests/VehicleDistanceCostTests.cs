using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class VehicleDistanceCostTests {
 [Fact] public void StartingFuelIsExcludedAndCrossCurrencyFuelCostsAreNotCombined(){var records=new[]{new FuelRecord{Id="a",VehicleId="car",Date=new(2026,1,1),Odometer=1000,Litres=40,Amount=320,Currency="CNY",TankStatus="Full"},new FuelRecord{Id="b",VehicleId="car",Date=new(2026,1,2),Odometer=1500,Litres=30,Amount=240,Currency="CNY",TankStatus="Full"}};var costs=new[]{new VehicleCostRow("c","1",new("car","tx","Fuel","240"),"CNY",new(2026,1,2),240,"1",null)};var result=JsonSerializer.SerializeToElement(VehicleDistanceCosts.Analyze(records,FuelIntervalAnalysis.Analyze(records),costs,new(2026,1,1),new(2026,1,31)),FinanceService.Json);Assert.Equal(.48m,result[0].GetProperty("fuelCostPerKm").GetDecimal());Assert.Equal(240,result[0].GetProperty("intervalFuelPaid").GetDecimal());records[1].Currency="USD";var foreign=JsonSerializer.SerializeToElement(VehicleDistanceCosts.Analyze(records,FuelIntervalAnalysis.Analyze(records),costs,new(2026,1,1),new(2026,1,31)),FinanceService.Json);var cny=foreign.EnumerateArray().Single(x=>x.GetProperty("currency").GetString()=="CNY");Assert.Equal(JsonValueKind.Null,cny.GetProperty("fuelCostPerKm").ValueKind);}
}
