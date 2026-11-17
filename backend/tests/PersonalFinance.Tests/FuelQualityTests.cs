using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelQualityTests
{
    static FuelRecord R(string id,int day=1,decimal litres=40,decimal? km=1000)=>new(){Id=id,VehicleId="car",Date=new(2026,1,day),Litres=litres,Amount=litres*8,Odometer=km,TankStatus="Full",FuelGrade="Petrol92"};
    static FuelQualityResult Analyze(FuelRecord[] rows, decimal? capacity=null)=>FuelQualityAnalysis.Analyze(rows,FuelIntervalAnalysis.Analyze(rows),new Dictionary<string,decimal?>{{"car",capacity}});
    [Fact] public void MissingFieldsCapacityAndEstimatesRemainSeparateFromTankFacts()
    {
        var r=R("a",litres:60,km:null);r.TankStatus="Unknown";r.FuelGrade="Unknown";r.QuantitySource="ReferenceSnapshot20261016";
        var result=Analyze([r],50);
        Assert.Contains(result.Issues,x=>x.Code=="EXCEEDS_TANK_CAPACITY"&&x.Observed==60&&x.Baseline==50);
        Assert.Contains(result.Issues,x=>x.Code=="MISSING_ODOMETER");Assert.Contains(result.Issues,x=>x.Code=="UNKNOWN_TANK_STATUS");
        Assert.Contains(result.Issues,x=>x.Code=="ESTIMATED_QUANTITY");Assert.Equal("Unknown",r.TankStatus);Assert.False(r.MissedFill);
    }
    [Fact] public void DuplicatesUseCurrencyGradeVehicleAndOneDayWindow()
    {
        var a=R("a");var b=R("b",2,km:1100);var usd=R("usd",2,km:1200);usd.Currency="USD";
        var grade=R("grade",2,km:1300);grade.FuelGrade="Petrol95";
        var other=R("other",2);other.VehicleId="other";
        var far=R("far",4,km:1400);
        var issues=Analyze([a,b,usd,grade,other,far]).Issues.Where(x=>x.Code=="POSSIBLE_DUPLICATE").ToArray();
        Assert.Equal(2,issues.Length);Assert.Contains(issues,x=>x.RecordId=="a"&&x.RelatedRecordIds.Contains("b"));Assert.Contains(issues,x=>x.RecordId=="b");
    }
    [Fact] public void LongGapsAndPriceDiscrepanciesAreReviewHints()
    {
        var a=R("a");var b=R("b",2,km:1200);b.Date=new(2026,5,1);b.QuantitySource="Calculated";b.EnteredUnitPrice=7;b.Amount=320;
        Assert.Contains(Analyze([a,b]).Issues,x=>x.Code=="LONG_RECORD_GAP"&&x.Baseline==90);
        Assert.Contains(Analyze([a,b]).Issues,x=>x.Code=="PRICE_AMOUNT_MISMATCH");
        b.Litres=45.714m;Assert.DoesNotContain(Analyze([a,b]).Issues,x=>x.Code=="PRICE_AMOUNT_MISMATCH");
    }
    [Fact] public void SmallSamplesNeverInventStatisticalFindings()
    {
        var rows=Enumerable.Range(0,5).Select(i=>R(i.ToString(),i+1,i==4?90:40,1000+i*500)).ToArray();
        Assert.Equal(4,Assert.Single(Analyze(rows).Samples).EligibleIntervals);
        Assert.DoesNotContain(Analyze(rows).Issues,x=>x.Code.StartsWith("CONSUMPTION_")||x.Code=="RISING_CONSUMPTION");
    }
    [Fact] public void SixIntervalsCompareOnlyWithPriorFiveAndExcludeEstimatedQuantities()
    {
        var rows=Enumerable.Range(0,7).Select(i=>R(i.ToString(),i+1,i==6?60:40,1000+i*500)).ToArray();
        var result=Analyze(rows);var issue=Assert.Single(result.Issues,x=>x.Code=="CONSUMPTION_INCREASE");
        Assert.Equal("6",issue.RecordId);Assert.Equal(12,issue.Observed);Assert.Equal(8,issue.Baseline);Assert.Equal(new[]{"1","2","3","4","5"},issue.RelatedRecordIds);
        rows[3].QuantitySource="ReferenceSnapshot20261016";
        Assert.DoesNotContain(Analyze(rows).Issues,x=>x.Code=="CONSUMPTION_INCREASE");
    }
    [Fact] public void LowConsumptionAndRisingSequenceAreExplainedWithoutFutureBaseline()
    {
        var rows=Enumerable.Range(0,8).Select(i=>R(i.ToString(),i+1,40+i,1000+i*500)).ToArray();
        var rising=Analyze(rows).Issues.Where(x=>x.Code=="RISING_CONSUMPTION").ToArray();Assert.NotEmpty(rising);
        rows[^1].Litres=10;
        var low=Assert.Single(Analyze(rows).Issues,x=>x.Code=="CONSUMPTION_DECREASE");Assert.Equal("7",low.RecordId);Assert.DoesNotContain("7",low.RelatedRecordIds);
    }
    [Fact] public void DuplicateChainsHaveOneFindingPerRecordAndNoQuadraticPairList()
    {
        var rows=Enumerable.Range(0,1000).Select(i=>R(i.ToString(),km:1000+i)).ToArray();
        var duplicates=Analyze(rows).Issues.Where(x=>x.Code=="POSSIBLE_DUPLICATE").ToArray();
        Assert.Equal(1000,duplicates.Length);Assert.All(duplicates,x=>Assert.Single(x.RelatedRecordIds));
    }
}
