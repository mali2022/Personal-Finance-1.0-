using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class InterestAccountingTests {
 static InterestItem Item(string paid="399",InterestArtistShare[]? shares=null)=>new(Guid.NewGuid().ToString(),"STAYREAL T恤",null,"服饰","M / 黑",1,"499","100","0","0",paid,"Daily","Held",shares??[],"");
 [Fact] public void DiscountIsNotIncomeAndPaidIsExplicit()=>Assert.Equal(399,InterestRules.Paid(Item()));
 [Fact] public void MultipleArtistsCannotEachReceiveFullPayment()=>Assert.Throws<ApiException>(()=>InterestRules.Paid(Item(shares:[new("a","399"),new("b","399")])));
 [Fact] public void ExplicitArtistSplitIsSupported()=>Assert.Equal(399,InterestRules.Paid(Item(shares:[new("a","199"),new("b","200")])));
 [Fact] public void IncorrectPaidAmountIsRejected()=>Assert.Throws<ApiException>(()=>InterestRules.Paid(Item("400")));
 [Fact] public void NegativeAndExcessPrecisionAreRejected(){Assert.Throws<ApiException>(()=>InterestRules.Amount("-1"));Assert.Throws<ApiException>(()=>InterestRules.Amount("1.001"));}
 [Fact] public void ZeroPriceGiftDoesNotInventSpending()=>Assert.Equal(0,InterestRules.Paid(Item("0") with{UnitPrice="0",Discount="0"}));
 [Fact] public void RefundRoundingPreservesEveryCentAcrossThreeArtists(){var item=Item("0.03",[new("a","0.01"),new("b","0.01"),new("c","0.01")]) with{UnitPrice="0.03",Discount="0"};Assert.Equal(0.01m,new[]{"a","b","c"}.Sum(a=>InterestRules.Share(item,0.01m,a)));Assert.Equal(0.01m,InterestRules.Share(item,0.01m,"a"));}}

