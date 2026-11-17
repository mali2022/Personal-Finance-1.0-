using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class VehiclePlanningTests
{
 static LifeInput Baseline=>new("Base",new(2026,1,1),24,"CNY",10000,0,0,500,2000,1000,0,0,0,0,0,0,0,[],[],[],"test","snapshot");
 static VehicleDecisionInput Input=>new("snapshot","CNY",1,600,500,true,[new("Keep","Keep",0,0,false,12000,8,8,100,200),new("Replace","Fuel",1000,500,true,12000,6,8,100,500)]);
 [Fact] public void ExistingMonthlyCostsAreReplacedAndVehicleValueIsNotAddedTwice(){var models=VehicleDecisionRules.Build(Input,Baseline);Assert.Equal(1140,models[0].MonthlyExpense);Assert.Equal(500,models[0].OtherAssets);Assert.Equal(0,models[0].RestrictedAssets);Assert.Equal(Baseline.Cash+Baseline.RestrictedAssets,models[0].Cash+models[0].OtherAssets+models[0].RestrictedAssets);Assert.Equal(0,models[0].OtherReturn);}
 [Fact] public void ReplacementUsesNativeBuySellAndTerminalResidual(){var model=VehicleDecisionRules.Build(Input,Baseline)[1];Assert.Equal(new[]{"SellAsset","BuyAsset","SellAsset"},model.Events.Select(e=>e.Type));Assert.Equal(500,model.Events[0].Basis);Assert.Equal(1000,model.Events[^1].Basis);Assert.NotNull(LifeSimulationEngine.Run(model));}
 [Fact] public void ImpossibleBaselineReclassificationsAndUnconfirmedInputAreRejected(){Assert.Throws<ApiException>(()=>VehicleDecisionRules.Build(Input with {CurrentVehicleBookValue=501},Baseline));Assert.Throws<ApiException>(()=>VehicleDecisionRules.Build(Input with {BaselineMonthlyVehicleCost=1001},Baseline));Assert.Throws<ApiException>(()=>VehicleDecisionRules.Build(Input with {ConfirmAssumptions=false},Baseline));}
 [Fact] public void YearMonthAndLeapBoundariesAreExact(){Assert.Equal(new DateOnly(2024,2,29),VehicleBudgetRules.Period("2024-02").To);Assert.Equal(new DateOnly(2026,12,31),VehicleBudgetRules.Period("2026").To);Assert.Throws<ApiException>(()=>VehicleBudgetRules.Period("2026-13"));Assert.Throws<ApiException>(()=>VehicleBudgetRules.Period("26-1"));}
 [Fact] public void BudgetsCannotInventCurrencyOrInvalidAmounts(){Assert.Throws<ApiException>(()=>VehicleBudgetRules.Validate(new("car","2026-10","Fuel","FAKE","100")));Assert.Throws<ApiException>(()=>VehicleBudgetRules.Validate(new("car","2026-10","Fuel","CNY","0")));Assert.Equal(100,VehicleBudgetRules.Validate(new("car","2026-10","All","CNY","100.00")));}
}
