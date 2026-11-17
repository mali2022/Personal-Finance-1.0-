using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class VehicleCostRulesTests
{
 static VehicleCostInput Input=>new("car","tx","Fuel","100.00");
 static FinanceTransaction Tx=>new(){Id="tx",UserId="user",Type="Expense",Amount=200,Currency="CNY",Status="Confirmed"};
 [Fact] public void AllocationsCannotExceedPostedTransaction(){Assert.Equal(100,VehicleCostRules.Validate(Input,Tx,100));Assert.Throws<ApiException>(()=>VehicleCostRules.Validate(Input,Tx,100.01m));}
 [Fact] public void PrincipalAcquisitionAndUnconfirmedSourcesAreNotCosts(){Assert.Throws<ApiException>(()=>VehicleCostRules.Validate(Input with {Category="LoanPrincipal"},Tx,0));Assert.Throws<ApiException>(()=>VehicleCostRules.Validate(Input,withStatus("Deleted"),0));}
 static FinanceTransaction withStatus(string status){var t=Tx;t.Status=status;return t;}
 [Fact] public void RefundsAndReimbursementsRequireOriginalAndCorrectLedgerType(){var t=Tx;t.Type="Refund";Assert.Throws<ApiException>(()=>VehicleCostRules.Validate(Input with {Kind="Refund"},t,0));Assert.Equal(100,VehicleCostRules.Validate(Input with {Kind="Refund",OriginalCostId="original"},t,0));t.Type="Income";Assert.Equal(100,VehicleCostRules.Validate(Input with {Kind="Reimbursement",OriginalCostId="original"},t,0));Assert.Throws<ApiException>(()=>VehicleCostRules.Validate(Input,t,0));}
 [Fact] public void CashSummaryKeepsCurrenciesSeparateAndDoesNotRepeatFuelPurchases(){var a=new VehicleCostRow("a","1",Input,"CNY",new(2026,10,1),100,"1",null);var refund=a with {Id="b",Input=Input with {Kind="Refund",OriginalCostId="a"},SignedAmount=-20};var other=a with {Id="c",Currency="USD",SignedAmount=10};var json=System.Text.Json.JsonSerializer.SerializeToElement(VehicleCostRules.Summary([a,refund,other]),FinanceService.Json);Assert.Equal(2,json.GetArrayLength());Assert.Equal(80,json[0].GetProperty("net").GetDecimal());Assert.Equal(10,json[1].GetProperty("net").GetDecimal());}
}
