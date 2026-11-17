using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelChronologyTests {
 static FuelRecord R(string id,int day,decimal km,bool reset=false,TimeOnly? time=null)=>new(){Id=id,UserId="u",VehicleId="car",Date=new(2026,1,day),Odometer=km,Litres=20,Amount=160,TankStatus="Full",OdometerReset=reset,OccurredTime=time};
 [Fact] public void ResetStartsNewSegmentAndNeverProducesCrossResetConsumption(){var rows=new[]{R("a",1,1000),R("b",2,1200),R("reset",3,10,true),R("d",4,210)};FuelChronology.Validate(rows);var result=FuelIntervalAnalysis.Analyze(rows);Assert.Equal("ODOMETER_RESET",result.Single(r=>r.RecordId=="reset").Reason);Assert.Equal("PENDING",result.Single(r=>r.RecordId=="reset").Status);var next=result.Single(r=>r.RecordId=="d");Assert.Equal("VALID",next.Status);Assert.Equal("reset",next.Start!.Id);Assert.Equal(200,next.Distance);}
 [Fact] public void SameDayResetRequiresUnambiguousActualTimes(){FuelRecord a=R("a",1,1000),b=R("b",1,10,true);Assert.Throws<ApiException>(()=>FuelChronology.Validate([a,b]));a.OccurredTime=new(8,0);b.OccurredTime=new(12,0);FuelChronology.Validate([b,a]);Assert.Equal(new[]{"a","b"},FuelChronology.Order([b,a]).Select(r=>r.Id));Assert.Equal("ODOMETER_RESET",FuelIntervalAnalysis.Analyze([b,a])[1].Reason);}
 [Fact] public void OrdinaryReversalsAndDuplicatesRemainBlocked(){Assert.Throws<ApiException>(()=>FuelChronology.Validate([R("a",1,1000),R("b",2,900)]));Assert.Throws<ApiException>(()=>FuelChronology.Validate([R("a",1,1000),R("b",2,1000)]));}
 [Fact] public void PartialResetDoesNotPretendToBeAFullBaseline(){FuelRecord a=R("a",1,1000),b=R("b",2,10,true),c=R("c",3,210);b.TankStatus="Partial";var result=FuelIntervalAnalysis.Analyze([a,b,c]);Assert.DoesNotContain(result,r=>r.Status=="VALID");}
 [Fact] public void RestoreAndImportUseTheSameSegmentValidation(){FuelRecord a=R("a",1,1000),reset=R("r",2,10,true),b=R("b",3,210);FuelBulkRules.ValidateRestore([reset],[a,b]);var input=new FuelRecordInput("car",reset.Date,10,20,150,"CNY",true,false,"Station","Meter replaced",TankStatus:"Full",OdometerReset:true);Assert.Equal(1,FuelImportRules.Plan(new([input]),[new FuelVehicle{Id="car",UserId="u"}],[a,b],new(2026,10,30)).Ready);}
}
