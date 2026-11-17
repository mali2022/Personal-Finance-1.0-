using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Domain;
using Xunit;
namespace PersonalFinance.Tests;
public class FuelPeriodComparisonTests {
 [Fact] public void MissingHistoricalBaseNeverCreatesAPercentage(){var result=JsonSerializer.SerializeToElement(FuelPeriodComparison.Analyze([new FuelRecord{Date=new(2026,1,2),Currency="CNY",Amount=100}],new(2026,1,1),new(2026,1,31),"CNY"),FinanceService.Json);Assert.Equal(JsonValueKind.Null,result.GetProperty("previousYear").GetProperty("changePercent").ValueKind);}
 [Fact] public void HistoricalComparisonsKeepOriginalCurrencyAndExactPeriod(){var result=JsonSerializer.SerializeToElement(FuelPeriodComparison.Analyze([new FuelRecord{Date=new(2026,1,2),Currency="CNY",Amount=150},new FuelRecord{Date=new(2025,1,2),Currency="CNY",Amount=100},new FuelRecord{Date=new(2025,1,3),Currency="USD",Amount=900}],new(2026,1,1),new(2026,1,31),"CNY"),FinanceService.Json);var year=result.GetProperty("previousYear");Assert.Equal(50,year.GetProperty("changePercent").GetDecimal());Assert.Equal(1,year.GetProperty("count").GetInt32());Assert.Equal("2025-01-01",year.GetProperty("from").GetString());}
}
