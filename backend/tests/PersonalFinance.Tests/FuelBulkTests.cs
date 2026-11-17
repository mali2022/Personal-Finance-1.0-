using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Tests;
public class FuelBulkTests
{
 static FuelRecord R(string id="a",string user="user",long version=1)=>new(){Id=id,UserId=user,Version=version,VehicleId="car",Date=new(2026,1,1),Odometer=1000,Litres=20,TankStatus="Unknown"};
 static FuelBulkInput B(string action="Delete",string version="1")=>new(action,[new("a",version)]);
 [Fact] public void DeleteAndRestoreRetainFactsAndIncrementVersions(){
  var r=R();var now=DateTimeOffset.UtcNow;FuelBulkRules.Validate("user",B(),[r]);FuelBulkRules.Apply(B(),[r],now);
  Assert.Equal(now,r.DeletedAt);Assert.Equal(20,r.Litres);Assert.Equal(1000,r.Odometer);Assert.Equal(2,r.Version);
  var restore=B("Restore","2");FuelBulkRules.Validate("user",restore,[r]);FuelBulkRules.Apply(restore,[r],now);Assert.Null(r.DeletedAt);Assert.Equal(3,r.Version);
 }
 [Fact] public void VersionsAndOwnershipAreCheckedBeforeMutation(){
  var r=R();Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",B(version:"0"),[r]));
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("other",B(),[r]));Assert.Null(r.DeletedAt);Assert.Equal(1,r.Version);
 }
 [Fact] public void OneStaleRowRejectsTheEntirePlan(){
  var a=R();var b=R("b",version:2);var request=new FuelBulkInput("Delete",[new("a","1"),new("b","1")]);
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",request,[a,b]));Assert.Null(a.DeletedAt);Assert.Null(b.DeletedAt);
 }
 [Fact] public void FullTankRequiresExplicitConfirmationAndUnknownCanBeRestored(){
  var r=R();var request=B("SetTankStatus") with {TankStatus="Full"};Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",request,[r]));
  request=request with {FullTankConfirmed=true};FuelBulkRules.Validate("user",request,[r]);FuelBulkRules.Apply(request,[r],DateTimeOffset.UtcNow);Assert.True(r.FullTank);Assert.Equal("Full",r.TankStatus);
  request=request with {TankStatus="Unknown",Targets=[new("a","2")]};FuelBulkRules.Validate("user",request,[r]);FuelBulkRules.Apply(request,[r],DateTimeOffset.UtcNow);Assert.False(r.FullTank);Assert.Equal("Unknown",r.TankStatus);
 }
 [Fact] public void InvalidStatesAndDuplicateIdsAreRejected(){
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",B("Restore"),[R()]));
  var r=R();r.DeletedAt=DateTimeOffset.UtcNow;Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",B(),[r]));
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",B() with {Targets=[new("a","1"),new("a","1")]},[R()]));
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",B("Purge"),[R()]));
 }
 [Fact] public void EmptyAndOversizedRequestsAreRejected(){
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",new("Delete",[]),[]));
  Assert.Throws<ApiException>(()=>FuelBulkRules.Validate("user",new("Delete",Enumerable.Range(0,201).Select(i=>new FuelBulkTarget(i.ToString(),"1")).ToArray()),[]));
 }
 [Fact] public void RestoreRejectsConflictingActiveOrSelectedMileage(){
  var restoring=R();restoring.DeletedAt=DateTimeOffset.UtcNow;var conflict=R("other");
  Assert.Throws<ApiException>(()=>FuelBulkRules.ValidateRestore([restoring],[conflict]));
  Assert.Throws<ApiException>(()=>FuelBulkRules.ValidateRestore([restoring,conflict],[]));
  conflict.VehicleId="different";FuelBulkRules.ValidateRestore([restoring],[conflict]);
 }
 [Fact] public void ActiveQueriesExcludeTrashAndRecoveryExplicitlyKeepsUserScope(){
  using var db=new FinanceDb(new DbContextOptionsBuilder<FinanceDb>().UseSqlServer("Server=localhost;Database=FuelMetadataOnly;Trusted_Connection=True;TrustServerCertificate=True").Options);
  var sql=db.Set<FuelRecord>().Where(r=>r.UserId=="user").ToQueryString();Assert.Contains("DeletedAt] IS NULL",sql);
  var restoreSql=db.Set<FuelRecord>().IgnoreQueryFilters().Where(r=>r.UserId=="user").ToQueryString();Assert.DoesNotContain("DeletedAt] IS NULL",restoreSql);Assert.Contains("UserId] =",restoreSql);
 }
}
