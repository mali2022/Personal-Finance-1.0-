using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelReceiptFactsTests {
 static FuelRecordInput Input=>new("car",new(2026,1,1),1000,20,150,"CNY",false,false,"Station","",PostedUnitPrice:8,OriginalAmount:160,Discount:5,PointsRedemption:5,PaymentMethod:"Card",DrivingScene:"City");
 [Fact] public void ReceiptFactsArePreservedAndUnknownHistoryStaysNull(){var r=new FuelRecord();FuelRecordRules.Validate(Input,new(2026,10,30));FuelRecordRules.Apply(r,Input);Assert.Equal(8,r.PostedUnitPrice);Assert.Equal(160,r.OriginalAmount);Assert.Equal(5,r.PointsRedemption);Assert.Equal("Card",r.PaymentMethod);FuelRecordRules.Apply(r,new("car",new(2026,1,1),1000,20,150,"CNY",false,false,"",""));Assert.Null(r.OriginalAmount);Assert.Null(r.PostedUnitPrice);}
 [Fact] public void FreeFuelRequiresManualActualVolumeAndDiscountsCannotExceedGross(){FuelRecordRules.Validate(Input with{Amount=0,Discount=155,PointsRedemption=5},new(2026,10,30));Assert.Throws<ApiException>(()=>FuelRecordRules.Validate(Input with{Amount=0,QuantitySource="Calculated",EnteredUnitPrice=8},new(2026,10,30)));Assert.Throws<ApiException>(()=>FuelRecordRules.Validate(Input with{Discount=160},new(2026,10,30)));}
 [Fact] public void RoundedDiscrepanciesWarnWithoutRewritingFacts(){var r=new FuelRecord{Id="r",VehicleId="car"};FuelRecordRules.Apply(r,Input with{Amount=149,OriginalAmount=159});var issues=FuelQualityAnalysis.Analyze([r],FuelIntervalAnalysis.Analyze([r]),new Dictionary<string,decimal?>()).Issues;Assert.Contains(issues,i=>i.Code=="POSTED_PRICE_MISMATCH");Assert.Equal(149,r.Amount);Assert.Equal(159,r.OriginalAmount);}
}
