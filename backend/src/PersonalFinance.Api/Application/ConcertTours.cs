using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record ConcertTour(string Name, string Artist, DateOnly? StartsOn, DateOnly? EndsOn, string State, string Note);
public sealed partial class FinanceService
{
    const string ConcertTourKind = "ConcertTour";
    public async Task<object> ConcertTourReport(string user, string id) {
        await RequireConcerts(user);
        var tour = await Document(user, id, ConcertTourKind);
        var rows = new List<System.Text.Json.JsonElement>();
        foreach (var doc in (await ConcertDocs(user)).Where(d => ConcertRead(d).TourId == id)) {
            rows.Add(System.Text.Json.JsonSerializer.SerializeToElement(new { doc.Id, version = doc.Version.ToString(), input = ConcertRead(doc), report = await ConcertReport(user, doc) }, Json));
        }
        return new { id, version = tour.Version.ToString(), input = InterestRead<ConcertTour>(tour), scenes = rows,
            currencies = rows.GroupBy(r => r.GetProperty("input").GetProperty("currency").GetString()).Select(group => {
                decimal Sum(string field) => group.Sum(r => Money(r.GetProperty("report").GetProperty(field).GetString()));
                return new { currency = group.Key, count = group.Count(), attended = group.Count(r => r.GetProperty("input").GetProperty("state").GetString() == "Attended"),
                    totalBudget = M(Sum("totalBudget")), originalCosts = M(Sum("originalCosts")), confirmedRefunds = M(Sum("confirmedRefunds")), actual = M(Sum("actual")), personalNetCost = M(Sum("personalNetCost")), transferRecovery=M(group.Sum(r=>Money(r.GetProperty("report").GetProperty("ticketTransfers").GetProperty("netRecovery").GetString()))), personalAfterTransfers=M(Sum("personalAfterTransfers")), insuranceRecovery=M(group.Sum(r=>Money(r.GetProperty("report").GetProperty("insuranceRecovery").GetProperty("netRecovery").GetString()))), finalPersonalCost=M(Sum("finalPersonalCost")), pendingPayables=M(Sum("pendingPayables")), planned = M(Sum("planned")), pendingAdvances = M(Sum("pendingAdvances")), remaining = M(Sum("totalBudget") - Sum("actual")) };
            }), rule = "包含当前关联的全部场次（含计划、取消场次），按场次原币分别汇总，不跨币种相加。全场净费用=有效已确认费用-已核实退款；个人自担=本人正式费用-对应退款+已确认赠送或核销损失；待收代付款单列，不计为个人消费。计划不计入已发生费用。各项金额复用场次报告，尚未分配的退款不冲减；警告与交易明细请下钻场次。转让净回收另列，不当退款或冲回预算；回收后净负担按原个人成本减有效净回收计算。" };
    }
    public async Task<object> ConcertTours(string user) {
        await RequireConcerts(user);
        var scenes = (await ConcertDocs(user)).Select(ConcertRead).ToArray();
        return (await InterestDocs(user, ConcertTourKind)).Select(d => new { d.Id, version = d.Version.ToString(), input = InterestRead<ConcertTour>(d), sceneCount = scenes.Count(x => x.TourId == d.Id) });
    }
    public async Task<object> SaveConcertTour(string user, string? id, ConcertTour input, string? version) {
        await RequireConcerts(user);
        ConcertText(input.Name, 200, true); ConcertText(input.Artist, 200, true); ConcertText(input.Note, 2000);
        Require(input.State is "Planned" or "Active" or "Completed" or "Cancelled", "巡演状态无效");
        Require((input.StartsOn == null || input.StartsOn.Value.Year >= 1900) && (input.EndsOn == null || input.EndsOn.Value.Year >= 1900) && (input.StartsOn == null || input.EndsOn == null || input.StartsOn <= input.EndsOn), "巡演日期范围无效");
        var doc = id == null ? new StoredDocument { UserId = user, Kind = ConcertTourKind, ContentType = "application/json" } : await Document(user, id, ConcertTourKind);
        if (id == null) { Require(version == "0", "新巡演版本应为0"); db.Add(doc); } else Version(doc, version);
        var before = id == null ? null : InterestRead<ConcertTour>(doc);
        doc.Content = System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(input, Json);
        if (id != null) doc.Version++;
        ConcertAudit(user, doc.Id, "TourUpdated", new { before, after = input });
        return new { doc.Id, version = doc.Version.ToString() };
    }
}
