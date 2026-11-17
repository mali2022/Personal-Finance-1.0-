using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
 public async Task<object> InvestmentPerformance(string user, IQueryCollection query, CancellationToken ct = default)
 {
  var (start, end) = IndicatorRange(query); var currency = query["currency"].ToString(); AssetCurrency(currency);
  var assets = await db.Set<InvestmentAsset>().AsNoTracking().Where(x => x.UserId == user && x.Currency == currency).ToArrayAsync(); var ids = assets.Select(x => x.Id).ToArray();
  var first = DateOnly.FromDateTime(start.ToOffset(TimeSpan.FromHours(8)).Date); var last = DateOnly.FromDateTime(end.AddTicks(-1).ToOffset(TimeSpan.FromHours(8)).Date);
  var trades = await db.Set<InvestmentTrade>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.AssetId) && x.State == "Active" && x.SettlementDate <= last).ToArrayAsync(); Require(trades.Length <= 100000 && assets.Length <= 1000, "报表超过计算上限，请缩小范围");
  var values = await db.Set<InvestmentValuation>().AsNoTracking().Where(x => x.UserId == user && ids.Contains(x.AssetId) && x.Date <= last).ToArrayAsync(); Require(values.Length <= 100000, "估值历史超过计算上限");
  var tradeGroups = trades.GroupBy(x=>x.AssetId).ToDictionary(g=>g.Key,g=>g.ToArray()); var valueGroups = values.GroupBy(x=>x.AssetId).ToDictionary(g=>g.Key,g=>g.ToArray());
  var rank = assets.Select(a => { var c = InvestmentMath.Calculate(tradeGroups.GetValueOrDefault(a.Id, [])); var v = valueGroups.GetValueOrDefault(a.Id, []).OrderByDescending(x => x.Date).FirstOrDefault(); var before = InvestmentMath.Calculate(tradeGroups.GetValueOrDefault(a.Id, []).Where(x => x.SettlementDate < first)); decimal? market = c.Quantity == 0 ? 0 : v == null ? null : InvestmentMath.Gross(c.Quantity,v.Price); return new { a.Id, a.Name, a.Type, quantity = D(c.Quantity), cost = D(c.Cost), realizedInPeriod = D(c.Realized - before.Realized), incomeInPeriod = M(c.Income-before.Income), feesInPeriod = M(c.Fees-before.Fees), marketValue = market == null ? null : M(market.Value), unrealized = market == null ? null : D(market.Value-c.Cost), valuationDate = v?.Date }; }).ToArray();
  var points = new List<object>();
  var monthsPerPoint = last.Year - first.Year >= 49 ? 12 : 1;
  for (var month = new DateOnly(first.Year,first.Month,1); month <= last; month = month.AddMonths(monthsPerPoint))
  {
   ct.ThrowIfCancellationRequested();
   var at = month.AddMonths(monthsPerPoint).AddDays(-1); if (at > last) at = last;
   var opening = month < first ? first : month;
   decimal realized=0, income=0, fees=0, cash=0, unrealized=0; var missing=0;
   foreach (var a in assets) { var c=InvestmentMath.Calculate(tradeGroups.GetValueOrDefault(a.Id, []).Where(x=>x.SettlementDate<=at)); var prior=InvestmentMath.Calculate(tradeGroups.GetValueOrDefault(a.Id, []).Where(x=>x.SettlementDate<opening)); realized+=c.Realized-prior.Realized; income+=c.Income-prior.Income; fees+=c.Fees-prior.Fees; var v=valueGroups.GetValueOrDefault(a.Id, []).Where(x=>x.Date<=at).OrderByDescending(x=>x.Date).FirstOrDefault(); if(c.Quantity>0) { if(v==null)missing++;else unrealized+=InvestmentMath.Gross(c.Quantity,v.Price)-c.Cost; } }
   foreach(var t in trades.Where(x=>x.SettlementDate>=opening && x.SettlementDate<=at)) { cash += InvestmentMath.CashMovement(t); }
   points.Add(new { month=month.ToString("yyyy-MM"), realized=M(realized), income=M(income), fees=M(fees), investmentCashFlow=M(cash), unrealizedCovered=M(unrealized), missingValuations=missing });
  }
  var coveredMarket = rank.Where(x=>x.marketValue!=null).Sum(x=>decimal.Parse(x.marketValue!, System.Globalization.CultureInfo.InvariantCulture));
  return new { currency, start=first,end=last, granularity = monthsPerPoint == 12 ? "year" : "month", periodMonthCount = monthsPerPoint, summary = new { marketValueCovered = M(coveredMarket), remainingCost = D(rank.Sum(x=>decimal.Parse(x.cost,System.Globalization.CultureInfo.InvariantCulture))), realizedInPeriod = D(rank.Sum(x=>decimal.Parse(x.realizedInPeriod,System.Globalization.CultureInfo.InvariantCulture))), incomeInPeriod = M(rank.Sum(x=>decimal.Parse(x.incomeInPeriod,System.Globalization.CultureInfo.InvariantCulture))), unrealizedCovered = D(rank.Where(x=>x.unrealized!=null).Sum(x=>decimal.Parse(x.unrealized!,System.Globalization.CultureInfo.InvariantCulture))), heldAssets = rank.Count(x=>decimal.Parse(x.quantity,System.Globalization.CultureInfo.InvariantCulture)>0), missingValuations = rank.Count(x=>x.marketValue==null), distribution = rank.Where(x=>x.marketValue!=null).GroupBy(x=>x.Type).Select(g=>new { type=g.Key, marketValue=M(g.Sum(x=>decimal.Parse(x.marketValue!,System.Globalization.CultureInfo.InvariantCulture))), percent=coveredMarket==0?null:D(g.Sum(x=>decimal.Parse(x.marketValue!,System.Globalization.CultureInfo.InvariantCulture))/coveredMarket*100) }) }, assets=rank,points,scope="期间价差损益与分红利息分列，费用已在成本或净所得中，不再次从收益扣除。未实现为各展示期间末持仓估值差额（已覆盖部分），现金流含买卖本金，不等同收益。未输出IRR/XIRR；不考虑汇率，原币单独报告。" };
 }
}



