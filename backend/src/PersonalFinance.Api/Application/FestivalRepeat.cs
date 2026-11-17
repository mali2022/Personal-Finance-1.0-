using System.Text.Json;
using Microsoft.EntityFrameworkCore;
namespace PersonalFinance.Api.Application;
public sealed record FestivalRepeatRequest(bool Confirm);
public sealed partial class FinanceService
{
 public async Task<object> FestivalRepeat(string user,string id,FestivalRepeatRequest request,string? version) {
  Require(request.Confirm,"请确认创建下一年计划");var d=await Document(user,id,FestivalKind);Version(d,version);var b=FestivalRead(d);Require(b.Recurrence=="Yearly","请先设置年度重复规则");
  DateOnly start;var nextYear=b.StartsOn.Year+1;Require(nextYear<=2100,"超出支持年份");
  if(b.Definition!="custom"){
   var definitions=JsonSerializer.SerializeToElement(FestivalRules.Definitions(nextYear),Json);var match=definitions.EnumerateArray().FirstOrDefault(x=>x.GetProperty("id").GetString()==b.Definition);Require(match.ValueKind!=JsonValueKind.Undefined,"模板日期不能可靠计算，请手动创建下一年计划");start=match.GetProperty("date").Deserialize<DateOnly>(Json);
  }else {Require(!(b.StartsOn.Month==2 && b.StartsOn.Day==29 && !DateTime.IsLeapYear(nextYear)),"下一年没有2月29日，请明确选择日期");start=b.StartsOn.AddYears(1);}
  var existing=await db.Documents.AsNoTracking().Where(x=>x.UserId==user && x.Kind==FestivalKind).ToArrayAsync();Require(!existing.Select(FestivalRead).Any(x=>x.Name==b.Name && x.StartsOn==start),"下一年已有同名计划");
  return await FestivalSave(user,null,b with {StartsOn=start,EndsOn=start.AddDays(b.EndsOn.DayNumber-b.StartsOn.DayNumber),PrepareOn=b.PrepareOn==null?null:start.AddDays(b.PrepareOn.Value.DayNumber-b.StartsOn.DayNumber),Purchases=[],State="Planning",Reserved=0},"0");
 }
}
