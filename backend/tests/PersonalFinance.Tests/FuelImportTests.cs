using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelImportTests
{
    static DateOnly Today=>new(2026,10,30);
    static FuelVehicle Car=>new(){Id="car",UserId="user",Name="Car"};
    static FuelRecordInput R(int day,decimal? km=1000,decimal litres=20)=>new("car",new(2026,1,day),km,litres,litres*8,"CNY",false,false,"Station","Note",HistoricalBackfill:km==null);
    static FuelImportPlan Plan(FuelRecordInput[] rows,FuelRecord[]? existing=null)=>FuelImportRules.Plan(new(rows),[Car],existing??[],Today);
    [Fact] public void UnorderedValidRowsAreReadyAndOriginalInputsAreNotChanged()
    {
        var rows=new[]{R(3,1500,30),R(1,1000,20),R(2,1200,25)};var plan=Plan(rows);
        Assert.Equal(3,plan.Ready);Assert.Equal(0,plan.Errors);Assert.All(rows,r=>Assert.Equal("Unknown",r.TankStatus));
    }
    [Fact] public void SameBatchAndExistingDuplicatesAreSkippedWithoutOverwriting()
    {
        var existing=new FuelRecord{Id="old",VehicleId="car"};FuelRecordRules.Apply(existing,R(1));
        var plan=Plan([R(1),R(3,1300),R(3,1400)],[existing]);
        Assert.Equal(1,plan.Ready);Assert.Equal(2,plan.Duplicates);Assert.Equal("old",plan.Rows[0].DuplicateIds[0]);Assert.Equal(1000,existing.Odometer);
    }
    [Fact] public void CurrencyAndGradeArePartOfDuplicateIdentity()
    {
        var plan=Plan([R(1) with {FuelGrade="Petrol92"},R(1,1100) with {Currency="USD",FuelGrade="Petrol92"},R(1,1200) with {FuelGrade="Petrol95"}]);Assert.Equal(3,plan.Ready);
    }
    [Fact] public void MileageConflictsAndMalformedRowsPreventCleanPlan()
    {
        var plan=Plan([R(1),R(2,900,21),R(3,1500) with {Litres=0},R(4,1600) with {Currency="FAKE"}]);
        Assert.Equal(3,plan.Errors);Assert.Equal(1,plan.Ready);
    }
    [Fact] public void ForeignAndArchivedVehiclesAreRejected()
    {
        Assert.Equal(1,Plan([R(1) with {VehicleId="foreign"}]).Errors);
        var car=Car;car.Status="Archived";
        Assert.Equal(1,FuelImportRules.Plan(new([R(1)]),[car],[],Today).Errors);
    }
    [Fact] public void MissingMileageIsOnlyAllowedForHistoricalDatesAndNeverAssumesFull()
    {
        Assert.Equal(1,Plan([R(1,null)]).Ready);
        Assert.Equal(1,Plan([R(1,null) with {Date=Today}]).Errors);
        Assert.Equal(1,Plan([R(1) with {Date=Today.AddDays(1)}]).Errors);
    }
    [Fact] public void InvalidDecimalPrecisionAndDerivedQuantityAreRejected()
    {
        Assert.Equal(1,Plan([R(1) with {Amount=1.001m}]).Errors);
        Assert.Equal(1,Plan([R(1) with {QuantitySource="Calculated",EnteredUnitPrice=8,Litres=21}]).Errors);
    }
    [Fact] public void BatchLimitsAreEnforcedBeforeProcessing()
    {
        Assert.Throws<ApiException>(()=>Plan([]));Assert.Throws<ApiException>(()=>Plan(Enumerable.Repeat(R(1),201).ToArray()));
    }
    [Fact] public void UnknownHistoricalGradeCannotBypassDuplicateReview()
    {
        var plan=Plan([R(1,null),R(1,null) with {FuelGrade="Petrol95"}]);Assert.Equal(1,plan.Ready);Assert.Equal(1,plan.Duplicates);
    }
}
