using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelIntervalAnalysisTests
{
    static FuelRecord R(string id, int day, decimal? km, decimal litres, string status="Full") => new(){Id=id,VehicleId="car",Date=new(2026,10,day),Odometer=km,Litres=litres,TankStatus=status};
    [Fact] public void EvidenceExcludesBaselineAndIncludesPartialWithoutMileage()
    {
        var rows=new[]{R("start",1,1000,40),R("partial",2,null,20,"Partial"),R("end",3,1500,30)};
        var result=FuelIntervalAnalysis.Analyze(rows.Reverse());
        var valid=Assert.Single(result,x=>x.Status=="VALID");
        Assert.Equal("start",valid.Start!.Id);Assert.Equal(new[]{"partial","end"},valid.ParticipatingRecords.Select(x=>x.Id));
        Assert.Equal(50,valid.Litres);Assert.Equal(500,valid.Distance);Assert.Equal(10,valid.LitresPer100Km);
        Assert.Equal("2.0",valid.RuleVersion);Assert.NotEqual(default,valid.CalculatedAt);
        Assert.Equal("NO_BASELINE",result[0].Reason);Assert.Equal("OPEN_INTERVAL",result[1].Reason);
    }
    [Theory]
    [InlineData("Unknown",1200,20,"PENDING","UNKNOWN_TANK_STATUS")]
    [InlineData("Partial",900,20,"INVALID","INVALID_ODOMETER")]
    [InlineData("Partial",1200,0,"INVALID","INVALID_QUANTITY")]
    public void BlockersAreExplainedAndCannotEnterAggregates(string tank,decimal km,decimal litres,string status,string reason)
    {
        var rows=new[]{R("a",1,1000,40),R("b",2,km,litres,tank),R("c",3,1500,30)};
        var result=FuelIntervalAnalysis.Analyze(rows);Assert.Equal(status,result[1].Status);Assert.Equal(reason,result[1].Reason);
        Assert.Null(result[1].LitresPer100Km);Assert.Empty(FuelMath.Intervals(rows));
    }
    [Fact] public void SameDayAmbiguityAndMissingFullEndpointRemainPending()
    {
        var result=FuelIntervalAnalysis.Analyze([R("a",1,1000,40),R("b",2,null,20,"Partial"),R("c",2,1500,30),R("d",3,null,30)]);
        Assert.Equal("AMBIGUOUS_ORDER",result[1].Reason);Assert.Equal("AMBIGUOUS_ORDER",result[2].Reason);
        Assert.Equal("MISSING_ENDPOINT_ODOMETER",result[3].Reason);Assert.DoesNotContain(result,x=>x.Status=="VALID");
    }
    [Fact] public void GapFullTankStartsFreshBaselineAndVehiclesNeverMix()
    {
        var gap=R("b",2,1500,30);gap.MissedFill=true;
        var other=R("other",2,9999,30);other.VehicleId="other";
        var result=FuelIntervalAnalysis.Analyze([R("a",1,1000,40),gap,other,R("c",3,2000,40)]);
        var valid=Assert.Single(result,x=>x.Status=="VALID");Assert.Equal("b",valid.Start!.Id);Assert.Equal(8,valid.LitresPer100Km);
        Assert.Equal("MISSED_FILL",result.Single(x=>x.RecordId=="b").Reason);
    }
}
