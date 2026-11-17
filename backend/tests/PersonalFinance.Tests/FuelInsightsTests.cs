using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelInsightsTests {
 [Fact] public void WindowsAreDistanceWeightedAndShortSamplesAreExplicit(){var rows=new[]{new FuelRecord{Id="a",VehicleId="car",Date=new(2026,1,1),Odometer=100,Litres=20,TankStatus="Full"},new FuelRecord{Id="b",VehicleId="car",Date=new(2026,1,2),Odometer=200,Litres=10,TankStatus="Full"},new FuelRecord{Id="c",VehicleId="car",Date=new(2026,1,3),Odometer=500,Litres=15,TankStatus="Full"}};var result=JsonSerializer.SerializeToElement(FuelInsightsAnalysis.Analyze(rows,FuelIntervalAnalysis.Analyze(rows)),FinanceService.Json);var window=result.GetProperty("windows")[0];Assert.Equal(2,window.GetProperty("samples").GetInt32());Assert.False(window.GetProperty("sufficient").GetBoolean());Assert.Equal(6.25m,window.GetProperty("litresPer100Km").GetDecimal());}
 [Fact] public void TenThousandOpenFillsHaveBoundedPreviewEvidenceAndFullOnDemandTrace(){var rows=Enumerable.Range(0,10000).Select(i=>new FuelRecord{Id=i.ToString(),VehicleId="car",Date=new DateOnly(1990,1,1).AddDays(i),Odometer=i*10,Litres=1,TankStatus=i==0?"Full":"Partial",QuantitySource=i==1?"ReferenceSnapshot20261016":"Manual"}).ToArray();var result=FuelIntervalAnalysis.Analyze(rows);Assert.Equal(9999,result[^1].Litres);Assert.Equal(9999,result[^1].ParticipatingRecordCount);Assert.True(result[^1].EvidenceTruncated);Assert.True(result[^1].HasEstimatedQuantity);Assert.All(result,a=>Assert.True(a.ParticipatingRecords.Length<=20));var detailed=FuelIntervalAnalysis.Analyze(rows,"9999")[^1];Assert.Equal(9999,detailed.ParticipatingRecords.Length);Assert.False(detailed.EvidenceTruncated);Assert.Equal(result[^1].Litres,detailed.Litres);}
}
