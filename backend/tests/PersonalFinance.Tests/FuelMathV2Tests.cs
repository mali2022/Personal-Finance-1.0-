using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelMathV2Tests {
 static FuelRecord R(int day,decimal? km,decimal litres,string status="Full")=>new(){VehicleId="v",Date=new(2026,10,day),Odometer=km,Litres=litres,TankStatus=status};
 [Fact] public void MissingPartialMileagePreservesEndpoints(){var r=Assert.Single(FuelMath.Intervals([R(1,1000,40),R(2,null,20,"Partial"),R(3,1500,30)]));Assert.Equal(50,r.Litres);Assert.Equal(10,r.LitresPer100Km);}
 [Fact] public void ReferenceIntervalsAreWeighted(){var r=FuelMath.Intervals([R(10,131991,36.26m),R(23,132384,30.88m),R(29,132612,18.13m)]);Assert.Equal(2,r.Length);Assert.Equal(7.86m,r[0].LitresPer100Km);Assert.Equal(7.95m,r[1].LitresPer100Km);Assert.Equal(7.89m,decimal.Round(r.Sum(x=>x.Litres)*100/r.Sum(x=>x.Distance),2));}
 [Fact] public void UnknownStatusBreaksInterval(){Assert.Empty(FuelMath.Intervals([R(1,1000,40),R(2,1200,20,"Unknown"),R(3,1500,30)]));}
 [Fact] public void ReversedMileageBreaksInterval(){Assert.Empty(FuelMath.Intervals([R(1,1000,40),R(2,900,20,"Partial"),R(3,1500,30)]));}
 [Fact] public void InvalidQuantityBreaksInterval(){Assert.Empty(FuelMath.Intervals([R(1,1000,40),R(2,1200,0,"Partial"),R(3,1500,30)]));}
}
