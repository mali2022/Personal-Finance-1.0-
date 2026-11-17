using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
 public async Task<object> ReinvestDividend(string user, InvestmentTradeInput b, string? version)
 {
  Require(b.TransactionId == null && b.Type == "Reinvest", "分红再投资须作为新的原子事件登记"); var a = await Investment(user,b.AssetId); Version(a,version);
  var dividend=Money(b.Amount,true); var tax=Money(b.Tax); var commission=Money(b.Commission); var other=Money(b.OtherFee);
  Require(tax>=0 && commission>=0 && other>=0 && dividend-tax==InvestmentMath.Gross(InvestmentDecimal(b.Quantity,true),InvestmentDecimal(b.Price,true))+commission+other,"税后分红必须等于再投资买入总成本（含买入费用）");
  var dividendResult=JsonSerializer.SerializeToElement(await SaveInvestmentTrade(user,b with {Type="Dividend",Quantity="0",Price="0",Commission="0",OtherFee="0",Note="分红再投资确认；"+b.Note},version),Json);
  var buyResult=JsonSerializer.SerializeToElement(await SaveInvestmentTrade(user,b with {Type="Buy",Amount="0",Tax="0",CategoryId=null,Note="分红再投资买入；"+b.Note},a.Version.ToString()),Json);
  var h=new InvestmentHistory {UserId=user,AssetId=a.Id,Kind="Reinvestment",Reason="用户确认分红再投资",SnapshotJson=JsonSerializer.Serialize(new {dividendTradeId=dividendResult.GetProperty("id").GetString(),buyTradeId=buyResult.GetProperty("id").GetString(),dividend, tax},Json)}; h.ResourceId=h.Id; db.Add(h);
  return new {h.Id,dividendTrade=dividendResult,buyTrade=buyResult,version=h.Version.ToString(),rule="同一事务确认净分红并再投资，账户现金净变动为零，成本只增加一次。两笔须成组撤销。"};
 }
 public async Task<object> RevokeReinvestment(string user,string id,InvestmentCorrectionInput b,string? version,bool preview)
 {
  var h=await db.Set<InvestmentHistory>().SingleOrDefaultAsync(x=>x.UserId==user && x.Id==id && x.Kind=="Reinvestment")??throw new ApiException(404,"再投资事件不存在"); Version(h,version);Require(b.Reason.Trim().Length is >0 and <=2000,"请填写更正原因");
  Require(!await db.Set<InvestmentHistory>().AnyAsync(x=>x.UserId==user && x.ResourceId==h.Id && x.Kind=="ReinvestmentRevoked"),"事件已撤销");var source=JsonSerializer.Deserialize<JsonElement>(h.SnapshotJson,Json);var ids=new[]{source.GetProperty("dividendTradeId").GetString()!,source.GetProperty("buyTradeId").GetString()!};
  var rows=await db.Set<InvestmentTrade>().Where(x=>x.UserId==user && x.AssetId==h.AssetId && ids.Contains(x.Id)).ToArrayAsync();Require(rows.Length==2 && rows.All(x=>x.State=="Active" && x.OwnsTransaction),"事件关联记录不一致");
  var all=await db.Set<InvestmentTrade>().AsNoTracking().Where(x=>x.UserId==user && x.AssetId==h.AssetId && x.State=="Active" && !ids.Contains(x.Id)).ToArrayAsync();var cost=InvestmentMath.ValidateHistory(all);var a=await Investment(user,h.AssetId);
  foreach(var row in rows){var transaction=await Transaction(user,row.TransactionId!);Require(!await db.Reconciliations.AnyAsync(x=>x.UserId==user && x.AccountId==a.AccountId && x.CreatedAt>=transaction.OccurredAt),"存在后续对账，请先核实");if(!preview){await ChangeTransaction(user,transaction.Id,false,transaction.Version.ToString(),investmentOperation:true);row.State="Revoked";row.Version++;}}
  if(!preview){db.Add(new InvestmentHistory {UserId=user,AssetId=a.Id,ResourceId=h.Id,Kind="ReinvestmentRevoked",Reason=b.Reason,SnapshotJson=h.SnapshotJson});h.Version++;a.Version++;a.UpdatedAt=DateTimeOffset.UtcNow;}
  return new {h.Id,quantity=D(cost.Quantity),cost=D(cost.Cost),realized=D(cost.Realized),income=M(cost.Income),preview};
 }
}
