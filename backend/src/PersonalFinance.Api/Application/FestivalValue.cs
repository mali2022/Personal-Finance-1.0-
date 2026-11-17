using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
 public async Task<object> FestivalValueCompare(string user,string id) {
  var d=await Document(user,id,FestivalKind);var b=FestivalRead(d);var report=JsonSerializer.SerializeToElement(await FestivalReport(user,d),Json);var options=b.Purchases.Where(x=>x.State!="Cancelled" && x.State!="Returned").Take(49).Select(x=>new SpendingOption(x.Id,[new(x.Name,Money(x.Amount),0,0,null)],[0],false)).ToArray();
  Require(options.Length>0,"请先添加至少一个候选采购项目");
  var input=new SpendingInput(Math.Max(0,Money(report.GetProperty("available").GetString())),null,0,null,[1],[..options,new("keep-cash",[],[0],false,"KeepCash")]);
  return new {results=SpendingValueMath.Compare(input),names=b.Purchases.ToDictionary(x=>x.Id,x=>x.Name),limitations=new[]{"调用现有消费价值实验室核算内核；候选项目作为独立备选，保留资金是单独选项","使用次数、时间、可支配现金与个人评分未确认，不生成精确价值排名或安全结论","预算为节日可用口径，不能替代月度预算与现金流约束"}};
 }
}
