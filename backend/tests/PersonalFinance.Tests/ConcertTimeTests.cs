using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public partial class ConcertTests {
 [Theory]
 [InlineData("2026-01-01T02:30:00Z","America/New_York",2025,12,31,21,-300)]
 [InlineData("2026-01-01T02:30:00Z","Asia/Shanghai",2026,1,1,10,480)]
 [InlineData("2026-03-08T06:30:00Z","America/New_York",2026,3,8,1,-300)]
 [InlineData("2026-03-08T07:30:00Z","America/New_York",2026,3,8,3,-240)]
 [InlineData("2026-11-01T05:30:00Z","America/New_York",2026,11,1,1,-240)]
 [InlineData("2026-11-01T06:30:00Z","America/New_York",2026,11,1,1,-300)]
 [InlineData("2026-01-01T00:30:00Z","Australia/Sydney",2026,1,1,11,660)]
 public void SceneTimeUsesLocalCalendarAndDaylightSaving(string instant,string zone,int year,int month,int day,int hour,int offset) {
  var scene=Scene() with{StartsAt=DateTimeOffset.Parse(instant),TimeZone=zone};var local=ConcertRules.LocalStart(scene);
  Assert.Equal((year,month,day,hour),(local.Year,local.Month,local.Day,local.Hour));Assert.Equal(TimeSpan.FromMinutes(offset),local.Offset);Assert.Equal(scene.StartsAt.UtcDateTime,local.UtcDateTime);
 }
 [Theory][InlineData("Invalid/Zone")][InlineData("Eastern Standard Time")][InlineData("")]
 public void SceneRejectsInvalidOrWindowsOnlyTimeZone(string zone)=>Assert.Throws<ApiException>(()=>ConcertRules.Zone(zone));
 [Fact] public void LegacySceneWithoutTimeZoneKeepsShanghaiCalendar() {
  var json=System.Text.Json.Nodes.JsonNode.Parse(JsonSerializer.Serialize(Scene() with{StartsAt=DateTimeOffset.Parse("2025-12-31T18:00:00Z")},FinanceService.Json))!;
  json.AsObject().Remove("timeZone");var scene=json.Deserialize<ConcertInput>(FinanceService.Json)!;
  Assert.Null(scene.TimeZone);Assert.Equal(2026,ConcertRules.LocalStart(scene).Year);Assert.Equal(TimeSpan.FromHours(8),ConcertRules.LocalStart(scene).Offset);
 }
}
