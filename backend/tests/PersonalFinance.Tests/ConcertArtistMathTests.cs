using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests {
 static ConcertInput Joint(params ConcertArtistShare[] shares)=>Scene() with{ArtistAllocation=new("Split",shares)};
 [Fact] public void JointRefundsConserveCentsAndNeverExceedOriginalArtistShares() {
  var scene=Joint(new("a",29.41m),new("b",29.41m),new("c",17.65m),new("d",9.8m),new("e",9.8m),new("f",3.93m));
  for(var paid=0;paid<=30;paid++) for(var refund=0;refund<=paid;refund++) {
   var parts=ConcertArtistMath.SplitCost(scene,paid/100m,refund/100m);
   Assert.Equal(paid/100m,parts.Values.Sum(p=>p.Paid));Assert.Equal(refund/100m,parts.Values.Sum(p=>p.Refund));Assert.Equal((paid-refund)/100m,parts.Values.Sum(p=>p.Net));
   Assert.All(parts.Values,p=>Assert.InRange(p.Refund,0,p.Paid));
  }
  var forward=ConcertArtistMath.SplitCost(scene,.26m,.25m);
  var reverse=ConcertArtistMath.SplitCost(scene with{ArtistAllocation=new("Split",scene.ArtistAllocation!.Shares.Reverse().ToArray())},.26m,.25m);
  Assert.All(forward,p=>Assert.Equal(p.Value,reverse[p.Key]));
 }
 [Fact] public void JointAllocationKeepsUnassignedMoneyAndProductOwnershipExplicit() {
  var scene=Joint(new("a",25),new("b",25));var parts=ConcertArtistMath.SplitCost(scene,100,20,10);
  Assert.Equal(new ConcertArtistCostPart(25,5,20,2.5m),parts["a"]);Assert.Equal(new ConcertArtistCostPart(50,10,40,5),parts[""]);
  var item=new InterestItem("item","商品",null,"其他","",1,"10","0","0","0","10","Daily","Held",[new("c","10")]);
  parts=ConcertArtistMath.SplitCost(scene,10,1,item:item);Assert.Equal(new ConcertArtistCostPart(10,1,9,0),parts["c"]);Assert.Equal(0,parts[""].Paid);
 }
 [Fact] public void JointAllocationSupportsLargeAmountsWithoutDecimalMultiplicationOverflow() {
  const decimal amount=999999999999999999.99m;var parts=ConcertArtistMath.SplitCost(Joint(new("a",33.33m),new("b",33.33m),new("c",33.34m)),amount,amount);
  Assert.Equal(amount,parts.Values.Sum(p=>p.Paid));Assert.Equal(amount,parts.Values.Sum(p=>p.Refund));Assert.All(parts.Values,p=>Assert.Equal(0,p.Net));
 }
 [Fact] public void ApportionHonorsExactRemainderTiesAcrossUnequalCentWeights() {
  var parts=InterestRules.Apportion(.03m,[("a",.04m),("b",.01m),("",.04m)]);
  Assert.Equal(.02m,parts[""]);Assert.Equal(.01m,parts["a"]);Assert.Equal(0,parts["b"]);
 }
}
