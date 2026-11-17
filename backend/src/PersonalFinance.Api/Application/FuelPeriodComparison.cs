using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public static class FuelPeriodComparison {
 public static object Analyze(FuelRecord[] records,DateOnly from,DateOnly to,string currency){
  var amount=records.Where(r=>r.Date>=from&&r.Date<=to&&r.Currency==currency).Sum(r=>r.Amount);
  object Period(DateOnly? start,DateOnly? end){var rows=start==null||end==null?[]:records.Where(r=>r.Date>=start&&r.Date<=end&&r.Currency==currency).ToArray();var previous=rows.Sum(r=>r.Amount);return new{from=start,to=end,count=rows.Length,amount=previous,currentAmount=amount,changePercent=previous>0?(decimal?)decimal.Round((amount-previous)*100/previous,2):null};}
  var days=to.DayNumber-from.DayNumber+1;return new{currency,previousPeriod=Period(from.DayNumber>=days?from.AddDays(-days):null,from.DayNumber>0?from.AddDays(-1):null),previousYear=Period(from.Year>1?from.AddYears(-1):null,to.Year>1?to.AddYears(-1):null),rule="Observed same-currency fuel purchases only, not consumed fuel or total vehicle costs. No percentage without a positive recorded comparison base; missing events cannot be ruled out."};
 }
}
