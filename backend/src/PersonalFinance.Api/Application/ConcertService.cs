using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    const string ConcertKind = "ConcertScene";
    static ConcertInput ConcertRead(StoredDocument doc) => JsonSerializer.Deserialize<ConcertInput>(doc.Content, Json)!;
    public async Task<object> ConcertPreferences(string user)
    {
        var doc = await db.Documents.AsNoTracking().FirstOrDefaultAsync(x => x.UserId == user && x.Kind == "OptionalModules");
        return new { version = doc?.Version.ToString() ?? "0", concerts = doc != null && JsonSerializer.Deserialize<ConcertModules>(doc.Content, Json)!.Concerts };
    }
    public async Task<object> SaveConcertPreferences(string user, ConcertModules b, string? version)
    {
        var doc = await db.Documents.FirstOrDefaultAsync(x => x.UserId == user && x.Kind == "OptionalModules");
        if (doc == null) { Require(version == "0", "设置版本无效"); doc = new() { UserId = user, Kind = "OptionalModules", Name = "modules", ContentType = "application/json" }; db.Add(doc); }
        else { Version(doc, version); doc.Version++; }
        doc.Content = JsonSerializer.SerializeToUtf8Bytes(b, Json);
        return new { concerts = b.Concerts, version = doc.Version.ToString() };
    }
    private async Task RequireConcerts(string user)
    {
        var pref = JsonSerializer.SerializeToElement(await ConcertPreferences(user), Json);
        if (!pref.GetProperty("concerts").GetBoolean()) throw new ApiException(403, "请先在设置中启用演唱会专项记账", "MODULE_DISABLED");
    }
    private async Task<StoredDocument> ConcertDoc(string user, string id)
    { await RequireConcerts(user); return await Document(user, id, ConcertKind); }
    private async Task<StoredDocument[]> ConcertDocs(string user) => await db.Documents.AsNoTracking().Where(x => x.UserId == user && x.Kind == ConcertKind).OrderByDescending(x => x.CreatedAt).ToArrayAsync();
    public async Task<object> ConcertList(string user)
    {
        await RequireConcerts(user);
        return (await ConcertDocs(user)).Select(d => new { d.Id, version = d.Version.ToString(), input = ConcertRead(d) }).ToArray();
    }
    public async Task<object> ConcertDetail(string user, string id)
    {
        var d = await ConcertDoc(user, id);
        return new { d.Id, version = d.Version.ToString(), input = ConcertRead(d), report = await ConcertReport(user, d) };
    }
    static void ConcertText(string value, int length = 200, bool required = false) => Require(value != null && value.Length <= length && (!required || value.Trim().Length > 0), "文本字段缺失或超过长度限制");
    static void ConcertIds(IEnumerable<string> values)
    { var a = values.ToArray(); Require(a.Length <= 500 && a.All(x => Guid.TryParse(x, out _)) && a.Distinct().Count() == a.Length, "记录ID无效或重复"); }
    void ConcertAudit(string user, string id, string action, object change)
    { db.Add(new AuditRecord { UserId = user, ResourceType = "Concert", ResourceId = id, Action = action, ChangesJson = JsonSerializer.Serialize(change, Json) }); }
    public async Task<object> SaveConcert(string user, string? id, ConcertInput b, string? version)
    {
        await RequireConcerts(user);
        var doc = id == null ? new StoredDocument { UserId = user, Kind = ConcertKind, ContentType = "application/json" } : await ConcertDoc(user, id);
        var old = id == null ? null : ConcertRead(doc);
        var zone = ConcertRules.Zone(b.TimeZone ?? old?.TimeZone);
        b = b with { TimeZone = zone.Id };
        b = b with { ArtistLink = b.ArtistLink ?? old?.ArtistLink };
        b = b with { ArtistAllocation = b.ArtistAllocation ?? old?.ArtistAllocation };
        b = b with {Insurance=b.Insurance??old?.Insurance,Closing=b.Closing??old?.Closing};
        b=b with{EventType=b.EventType??old?.EventType};Require(b.EventType==null || b.EventType is "Concert" or "JointConcert" or "Festival","演出类型无效");
        b=b with{Orders=b.Orders.Select(o=>o with{Tickets=o.Tickets?.Select(t=>t with{PersonalShare=string.IsNullOrEmpty(t.PersonalShare)?old?.Orders.FirstOrDefault(x=>x.Id==o.Id)?.Tickets?.FirstOrDefault(x=>x.Id==t.Id)?.PersonalShare:t.PersonalShare}).ToArray()}).ToArray()};
        b=b with {Costs=b.Costs.Select(c=>c with{ArtistAllocation=c.ArtistAllocation??old?.Costs.FirstOrDefault(x=>x.Id==c.Id)?.ArtistAllocation}).ToArray(),Orders=b.Orders.Select(o=>o with{ArtistAllocation=o.ArtistAllocation??old?.Orders.FirstOrDefault(x=>x.Id==o.Id)?.ArtistAllocation,Origin=o.Origin??old?.Orders.FirstOrDefault(x=>x.Id==o.Id)?.Origin}).ToArray()};
        foreach(var plan in b.Costs.Select(c=>c.ArtistAllocation).Concat(b.Orders.Select(o=>o.ArtistAllocation)).Where(a=>a!=null).Select(a=>a!)) {
            Require(plan.Mode is "Primary" or "Split" && plan.Shares.Length<=50 && (plan.Mode=="Split" || plan.Shares.Length==0),"逐费用归属模式无效");ConcertIds(plan.Shares.Select(s=>s.ArtistId));
            Require(plan.Shares.All(s=>s.Ratio>=0 && s.Ratio<=100 && decimal.Round(s.Ratio,2)==s.Ratio) && plan.Shares.Sum(s=>s.Ratio)<=100,"逐费用艺人比例须为最多两位小数且合计不超过100%");
            Require(plan.Mode!="Split" || b.ArtistAllocation?.Mode=="Split","请先启用场次联合费用模式，再设置逐费用覆盖比例");
            foreach(var share in plan.Shares) await RequireInterestTopic(user,share.ArtistId,"Artist");
        }
        if (old == null) Require(version == "0", "新档案版本应为0"); else Version(doc, version);
        if (b.ArtistLink?.ArtistId is { } artistId) {
            Require(Guid.TryParse(artistId, out _), "艺人档案ID无效");
            var artist = InterestRead<InterestTopic>(await Document(user, artistId, "MusicTopic"));
            Require(artist.Kind == "Artist", "场次主艺人不能关联品牌档案");
            b = b with { Artist = artist.Name };
        }
        if(b.ArtistAllocation is {} allocation) {
            Require(allocation.Mode is "Primary" or "Split" && allocation.Shares is {Length:<=50},"艺人分配模式或数量无效");
            Require(allocation.Mode=="Split" || allocation.Shares.Length==0,"主艺人模式不得保留联合费用比例");
            ConcertIds(allocation.Shares.Select(s=>s.ArtistId));
            Require(allocation.Shares.All(s=>s.Ratio>=0 && s.Ratio<=100 && decimal.Round(s.Ratio,2)==s.Ratio) && allocation.Shares.Sum(s=>s.Ratio)<=100,"艺人比例最多两位小数，合计不得超过100%");
            foreach(var share in allocation.Shares) await RequireInterestTopic(user,share.ArtistId,"Artist");
        }
        foreach (var text in new[] { b.Artist, b.Title, b.City, b.Venue }) ConcertText(text, required: true);
        foreach (var text in new[] { b.TourName, b.SessionNumber, b.Organizer, b.Platform }) ConcertText(text);
        ConcertText(b.Note, 2000); Require(b.TourId == null || Guid.TryParse(b.TourId, out _), "巡演ID无效");
        Require(CurrencyDefinitions.Supports(b.Currency) && b.StartsAt.Year is >= 1900 and <= 9900 && b.ExpectedPeople is >= 0 and <= 100000 && b.ActualPeople is >= 0 and <= 100000 && ConcertRules.SceneStates.Contains(b.State), "场次币种、日期、人数或状态无效");
        var total = ConcertRules.Amount(b.TotalBudget);
        Require(b.State != "Attended" || b.StartsAt <= DateTimeOffset.UtcNow, "演出尚未开始，不能标记已参加");
        Require(b.Budgets.Length <= 6 && b.Budgets.Select(x => x.Category).Distinct().Count() == b.Budgets.Length && b.Budgets.All(x => ConcertRules.BudgetCategories.Contains(x.Category)) && b.Budgets.Sum(x => ConcertRules.Amount(x.Amount)) <= total, "分类预算不得重复或超过总预算");
        ConcertIds(b.Orders.Select(x => x.Id)); ConcertIds(b.Costs.Select(x => x.Id)); ConcertIds(b.Refunds.Select(x => x.Id)); ConcertIds(b.Plans.Select(x => x.Id)); ConcertIds(b.Companions.Select(x => x.Id));
        if (old != null) {
            ConcertRules.Transition(old.State, b.State, "scene");
            Require(old.Orders.All(x => b.Orders.Any(y => y.Id == x.Id)) && old.Refunds.All(x => b.Refunds.Any(y => y.Id == x.Id)), "订单和退款须保留历史，请取消或变更状态");
            Require(old.Currency == b.Currency || old.Costs.Length == 0 && old.Orders.All(x => x.PaymentTransactionId == null) && old.Companions.All(x => x.AdvanceId == null), "已有财务关联不能直接更换币种");
        }
        b=b with{Orders=b.Orders.Select(order=>order with{Tickets=order.Tickets?.Select(ticket=>ticket with{Gift=ValidateTicketGift(b,order,ticket,old?.Orders.FirstOrDefault(o=>o.Id==order.Id)?.Tickets?.FirstOrDefault(t=>t.Id==ticket.Id)),Transfer=ticket.Transfer??old?.Orders.FirstOrDefault(o=>o.Id==order.Id)?.Tickets?.FirstOrDefault(t=>t.Id==ticket.Id)?.Transfer}).ToArray()}).ToArray()};
        b=b with {Orders=b.Orders.Select(o=>o with {Tickets=o.Tickets?.Select(t=>t with {PaidShare=string.IsNullOrEmpty(t.PaidShare)?old?.Orders.FirstOrDefault(x=>x.Id==o.Id)?.Tickets?.FirstOrDefault(x=>x.Id==t.Id)?.PaidShare:t.PaidShare}).ToArray()}).ToArray(), Refunds=b.Refunds.Select(r=>r with {TicketId=r.TicketId=="__order__"?null:r.TicketId??old?.Refunds.FirstOrDefault(x=>x.Id==r.Id)?.TicketId}).ToArray()};
        b=b with {Orders=b.Orders.Select(o=>o with {Tickets=o.Tickets?.Select(t=>t with {Outcome=t.Outcome??old?.Orders.FirstOrDefault(x=>x.Id==o.Id)?.Tickets?.FirstOrDefault(x=>x.Id==t.Id)?.Outcome}).ToArray()}).ToArray()};
        var otherDocs = (await ConcertDocs(user)).Where(x => x.Id != doc.Id).ToArray();
        var others = otherDocs.Select(ConcertRead).ToArray();
        if (b.TourId != null) {
            var tour = await db.Documents.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.Id == b.TourId && x.Kind == ConcertTourKind);
            Require(tour != null || old?.TourId == b.TourId || others.Any(x => x.TourId == b.TourId), "巡演不存在或不属于当前用户");
            if (tour != null) b = b with { TourName = InterestRead<ConcertTour>(tour).Name };
        }
        ConcertIds(b.Orders.SelectMany(x => x.Tickets ?? []).Select(x => x.Id));
        foreach (var o in b.Orders)
        {
            ConcertText(o.Platform, required: true); ConcertText(o.Number); ConcertText(o.Tier); ConcertText(o.Seat); ConcertText(o.Holder, 100);
            Require(o.Quantity is >= 1 and <= 10000 && ConcertRules.OrderStates.Contains(o.State) && ConcertRules.RefundStates.Contains(o.RefundState), "订单数量或状态无效");
            var paid = ConcertRules.Amount(o.PaidAmount); var fee = ConcertRules.Amount(o.Fee); ConcertRules.Amount(o.FacePrice);
            if(o.Origin is {} origin) {
                ConcertText(origin.From,100,origin.Kind=="Gift");ConcertText(origin.Note,1000);Require(origin.Kind is "Self" or "Gift","门票来源无效");
                if(origin.Kind=="Gift") Require(origin.PlatformAllowed && origin.ReceivedOn!=null && origin.ReceivedOn.Value.Year>=1900 && origin.ReceivedOn<=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,zone).DateTime) && paid==0 && fee==0 && o.PaymentTransactionId==null && (o.PaymentParts?.Length??0)==0,"免费获赠须确认平台规则、填写已发生日期，且不能关联付款或非零实付");
            }
            var parts = o.PaymentParts ?? [];
            Require(parts.Length <= 10 && parts.Select(x => x.TransactionId).Distinct().Count() == parts.Length && parts.All(x => ConcertRules.Amount(x.Amount) > 0 && ConcertRules.Amount(x.Fee) <= ConcertRules.Amount(x.Amount)), "组合付款来源不得重复，金额须有效，最多10笔");
            Require(parts.Length == 0 || o.PaymentTransactionId == null && parts.Sum(x => ConcertRules.Amount(x.Amount)) == paid && parts.Sum(x => ConcertRules.Amount(x.Fee)) == fee, "组合付款不能同时选择单笔付款，分配实付与手续费合计须等于订单");
            Require(fee <= paid, "手续费已包含在实付金额内，不能超过实付金额");
            Require(o.OrderedOn == null || o.OrderedOn.Value.Year >= 1900, "下单日期无效");
            Require(o.PaidOn == null || o.PaidOn <= DateOnly.FromDateTime(DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).DateTime) && (o.OrderedOn == null || o.PaidOn >= o.OrderedOn), "支付日期不能早于下单日或晚于今天");
            var prior = old?.Orders.FirstOrDefault(x => x.Id == o.Id);
            var tickets = o.Tickets ?? [];
            Require(tickets.Where(t=>t.PaidShare!=null).Sum(t=>ConcertRules.Amount(t.PaidShare!))<=paid,"逐票实付分配不能超过订单实付总额");
            Require(tickets.All(t=>t.PersonalShare==null || t.PaidShare!=null && ConcertRules.Amount(t.PersonalShare)<=ConcertRules.Amount(t.PaidShare)),"本人承担分配不能超过本票实付分配");
            Require(tickets.Length <= o.Quantity, "逐张门票数不能超过订单张数，未登记门票可稍后补录");
            Require((prior?.Tickets ?? []).All(x => tickets.Any(t => t.Id == x.Id)), "已登记门票须保留历史，请修改状态而非删除");
            foreach (var ticket in tickets) {
                ConcertText(ticket.Tier); ConcertText(ticket.Seat); ConcertText(ticket.Attendee, 100);
                Require(ticket.Format is "Electronic" or "Paper" && ticket.State is "Pending" or "Received" or "Used" or "Cancelled", "门票类型或状态无效");
                var previous = prior?.Tickets?.FirstOrDefault(x => x.Id == ticket.Id);
                Require(previous == null || previous.State == ticket.State || (previous.State, ticket.State) is ("Pending", "Received") or ("Pending", "Cancelled") or ("Received", "Used") or ("Received", "Cancelled"), "门票状态不能直接跳转");
                Require(ticket.State is not ("Received" or "Used") || o.State is "Issued" or "Used" || ticket.State=="Received" && o.State=="Postponed" && previous?.State=="Received", "领取或使用门票前须将订单标记为已出票，已领取门票延期保留原状态");
                Require(ticket.State != "Used" || b.StartsAt <= DateTimeOffset.UtcNow, "演出尚未开始，不能标记门票已使用");
            }
            if (JsonSerializer.Serialize(prior?.Tickets ?? [], Json) != JsonSerializer.Serialize(tickets, Json))
                ConcertAudit(user, doc.Id, "TicketsUpdated", new { orderId = o.Id, before = prior?.Tickets ?? [], after = tickets });
            if (prior != null) { ConcertRules.Transition(prior.State, o.State, "order"); ConcertRules.Transition(prior.RefundState, o.RefundState, "refund"); }
            Require(!new[] { "Paid", "Issued", "Used" }.Contains(o.State) || o.Origin?.Kind=="Gift" && o.State!="Paid" || (o.PaymentTransactionId != null || parts.Length > 0) && o.PaidOn != null && paid > 0, "支付、出票或使用状态须关联真实付款；免费获赠须明确来源且不能标记为已付款");
            Require(o.PaymentTransactionId == null && parts.Length == 0 || o.PaidOn != null && paid > 0, "关联付款需明确实付金额和支付日期");
            if (prior?.PaymentParts is { Length: > 0 }) Require(JsonSerializer.Serialize(prior.PaymentParts, Json) == JsonSerializer.Serialize(parts, Json) && ConcertRules.Amount(o.PaidAmount) == ConcertRules.Amount(prior.PaidAmount) && ConcertRules.Amount(o.Fee) == ConcertRules.Amount(prior.Fee), "已关联组合付款不可改写，请使用原交易和退款流程");
            Require(o.State != "Used" || b.StartsAt <= DateTimeOffset.UtcNow, "演出尚未开始，不能标记已使用");
            if (prior?.PaymentTransactionId != null) Require(o.PaymentTransactionId == prior.PaymentTransactionId && ConcertRules.Amount(o.PaidAmount) == ConcertRules.Amount(prior.PaidAmount) && ConcertRules.Amount(o.Fee) == ConcertRules.Amount(prior.Fee), "已关联付款的订单金额和付款来源不可改写，请通过原交易及退款流程处理");
            if (!string.IsNullOrWhiteSpace(o.Number)) {
                var number = o.Number.Trim(); var platform = o.Platform.Trim().ToUpperInvariant();
                Require(!b.Orders.Any(x => x.Id != o.Id && x.Platform.Trim().ToUpperInvariant() == platform && x.Number.Trim() == number) && !others.SelectMany(x => x.Orders).Any(x => x.Platform.Trim().ToUpperInvariant() == platform && x.Number.Trim() == number), "同一票务平台已有该订单号，请核对（不同平台分别检查）");
            }
        }
        var costs = ConcertRules.EffectiveCosts(b);
        var musicPurchases = (await InterestDocs(user, InterestPurchaseKind)).Select(InterestRead<InterestPurchase>).Where(x => x.State == "Purchased" && x.TransactionId != null).ToArray();
        var musicCosts = musicPurchases.SelectMany(p => p.Items.Select(i => new ConcertCost(i.Id, "Merch", p.TransactionId!, null, i.Paid, "本人", "本人")));
        var allCosts = others.SelectMany(ConcertRules.EffectiveCosts).Concat(costs).Concat(musicCosts).ToArray();
        var allScenes=others.Append(b).ToArray();var transfers=ConcertTransfers(allScenes).ToArray();var transferReturns=ConcertReturnLinks(allScenes).ToArray();
        await ValidateCollectionSourceExclusion(user,ConcertIncomeLinks(allScenes).Select(p=>p.TransactionId),allCosts.Select(c=>c.TransactionId).Concat(transferReturns.Select(p=>p.TransactionId)));
        var txIds = allCosts.Select(x => x.TransactionId).Concat(b.Refunds.Where(x => x.TransactionId != null).Select(x => x.TransactionId!)).Concat(ConcertIncomeLinks(allScenes).Concat(transferReturns).Select(p=>p.TransactionId)).Distinct().ToArray();
        var txs = await db.Transactions.AsNoTracking().Include(x => x.Entries).Where(x => x.UserId == user && txIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        var payableBusinesses=await ConcertPayableBusinesses(user);
        foreach (var c in costs)
        {
            Require(ConcertRules.Categories.Contains(c.Category) && ConcertRules.Amount(c!.Amount) > 0, "费用分类或分配金额无效"); ConcertText(c.Payer, 100); ConcertText(c.Bearer, 100);
            Require(txs.TryGetValue(c.TransactionId, out var t) && t.Status == "Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow && t.Currency == b.Currency && (ConcertPersonalSource(t,payableBusinesses) || t.Type == "ReimbursementAdvance"), "费用须关联本人已确认消费、受控他人代付或原代垫付款，币种一致");
            if(t!.Type=="LoanReceived") Require(costs.Where(x=>x.TransactionId==t.Id).Sum(x=>Money(x.Amount))==t.Amount && !others.SelectMany(ConcertRules.EffectiveCosts).Any(x=>x.TransactionId==t.Id),"他人代付费用须完整归属单一场次，避免重复计算应付本金");
            Require(allCosts.Where(x => x.TransactionId == c.TransactionId).Sum(x => ConcertRules.Amount(x.Amount))+transferReturns.Where(p=>p.TransactionId==c.TransactionId).Sum(p=>ConcertRules.Amount(p.Amount)) <= t!.Amount, "该交易跨场次费用与转让返款分配合计超过真实交易金额");
            if (c.EntryId != null) {
                var entry = t.Entries.SingleOrDefault(x => x.Id == c.EntryId && x.Kind == "Expense");
                Require(entry != null && allCosts.Where(x => x.TransactionId == c.TransactionId && x.EntryId == c.EntryId).Sum(x => ConcertRules.Amount(x.Amount)) <= entry.Amount, "拆分分录不存在或分配超过分录金额");
            }
        }
        await ValidateConcertTransfers(b,old,allScenes,allCosts,txs,payableBusinesses);
        ValidateConcertClosingDetails(b,old,allScenes,allCosts,txs);
        foreach (var order in b.Orders.Where(x => x.PaymentTransactionId != null)) Require(ConcertPersonalSource(txs[order.PaymentTransactionId!],payableBusinesses), "门票订单须关联真实消费或受控他人代付；代垫本金使用组合付款");
        foreach (var part in b.Orders.SelectMany(x => x.PaymentParts ?? []).Where(x => txs[x.TransactionId].Type == "ReimbursementAdvance")) Require(ConcertRules.Amount(part.Fee) == 0, "代垫本金不单独记手续费，请将本人手续费归属到原本人消费流水");
        foreach (var cost in costs.Where(x => txs[x.TransactionId].Type == "ReimbursementAdvance" && !b.Companions.Any(p => p.CostId == x.Id && p.AdvanceId != null))) {
            var businessId = txs[cost.TransactionId].BusinessId;
            var advance = await db.Set<ThirdPartyAdvance>().SingleOrDefaultAsync(x => x.UserId == user && x.BusinessId == businessId);
            Require(advance != null && ConcertRules.Amount(cost.Amount) == advance.Amount - advance.OwnAmount, "代垫费用须关联现有代买代付的完整原始应收本金");
            var nickname = advance!.Counterparty[..Math.Min(100, advance.Counterparty.Length)];
            var payer = advance.Payer[..Math.Min(100, advance.Payer.Length)];
            b = b with { Companions = [..b.Companions, new ConcertCompanion(Guid.NewGuid().ToString(), nickname, "", payer, nickname, 100, cost.Amount, advance.Id, cost.Id)] };
        }
        foreach (var p in b.Plans) {
            ConcertText(p.Title, required: true); Require(ConcertRules.Categories.Contains(p.Category) && new[] { "Planned", "Realized", "Cancelled" }.Contains(p.State), "计划费用无效"); ConcertRules.Amount(p.Amount);
            Require(p.State != "Realized" || p.CostId != null && costs.Any(x => x.Id == p.CostId), "已发生计划必须关联一笔已核算费用，不能手工增加预算执行额");
        }
        var allRefunds = others.SelectMany(x => x.Refunds).Concat(b.Refunds).Concat(musicPurchases.SelectMany(p => p.Refunds.Select(r => new ConcertRefund("music:" + r.ItemId, r.ItemId, "Partial", r.Amount, "0", r.TransactionId, r.Amount, "")))).ToArray();
        foreach (var r in b.Refunds) {
            var c = costs.SingleOrDefault(x => x.Id == r.CostId); Require(c != null && ConcertRules.RefundStates.Contains(r.State), "退款须关联费用"); ConcertText(r.Note, 1000);
            var requested = ConcertRules.Amount(r.RequestedAmount); var nonRefundable = ConcertRules.Amount(r.NonRefundable); var received = ConcertRules.Amount(r.ReceivedAmount);
            Require(requested > 0 && requested + nonRefundable <= ConcertRules.Amount(c!.Amount) && received <= requested, "退款申请及不可退费用不能超过原分配费用");
            var prior = old?.Refunds.FirstOrDefault(x => x.Id == r.Id); if (prior != null) ConcertRules.Transition(prior.State, r.State, "refund");
            if(r.TicketId!=null) {
                var order=b.Orders.SingleOrDefault(o=>(o.Tickets??[]).Any(t=>t.Id==r.TicketId));
                var ticket=order?.Tickets?.Single(t=>t.Id==r.TicketId);
                Require(ticket?.PaidShare!=null && ConcertRules.OrderCost(r.CostId,order!.Id),"逐票退款须关联同订单费用，并先明确本票实付分配");
                var ticketRefunds=b.Refunds.Where(x=>x.TicketId==r.TicketId).ToArray();
                Require(ticketRefunds.Sum(x=>ConcertRules.Amount(x.ReceivedAmount)) + ticketRefunds.Sum(x=>ConcertRules.Amount(x.NonRefundable))<=ConcertRules.Amount(ticket!.PaidShare!),"逐票到账及不可退金额超过本票实付分配");
                Require(ticketRefunds.Where(x=>x.State is not ("None" or "Rejected")).Sum(x=>ConcertRules.Amount(x.RequestedAmount)+ConcertRules.Amount(x.NonRefundable))<=ConcertRules.Amount(ticket.PaidShare!),"逐票退款申请合计超过本票实付分配");
            }
            Require(r.TransactionId == null ? received == 0 && r.State is not ("Partial" or "Full") : received > 0 && r.State is "Partial" or "Full", "到账金额和到账状态必须与真实退款关联一致");
            if (r.TransactionId != null) {
                Require(txs.TryGetValue(r.TransactionId, out var t) && t.Type == "Refund" && t.Status == "Confirmed" && t.OccurredAt<=DateTimeOffset.UtcNow && t.OriginalTransactionId == c!.TransactionId && t.Currency == b.Currency, "实际退款须是原交易下已确认的同币种退款");
                Require(allRefunds.Where(x => x.TransactionId == r.TransactionId).Sum(x => ConcertRules.Amount(x.ReceivedAmount)) <= t!.Amount, "退款跨场次分配超过实际到账");
                Require(b.Refunds.Where(x => x.CostId == c!.Id).Sum(x => ConcertRules.Amount(x.ReceivedAmount)) <= ConcertRules.Amount(c!.Amount), "已到账退款超过费用分配");
                Require(r.State != "Full" || received == requested, "全额到账须等于申请金额");
            }
        }
        foreach (var o in b.Orders.Where(o => o.RefundState is "Partial" or "Full")) {
            var refunded = b.Refunds.Where(x => ConcertRules.OrderCost(x.CostId, o.Id)).Sum(x => ConcertRules.Amount(x.ReceivedAmount));
            foreach (var cost in costs.Where(x => ConcertRules.OrderCost(x.Id, o.Id) && txs[x.TransactionId].Type == "ReimbursementAdvance")) {
                var businessId = txs[cost.TransactionId].BusinessId;
                var advance = await db.Set<ThirdPartyAdvance>().AsNoTracking().SingleOrDefaultAsync(x => x.UserId == user && x.BusinessId == businessId);
                if (advance != null) refunded += await (from adjustment in db.Set<AdvanceAdjustment>() join t in db.Transactions on adjustment.TransactionId equals t.Id where adjustment.UserId == user && adjustment.AdvanceId == advance.Id && adjustment.Action == "MerchantRefund" && t.Status != "Deleted" select (decimal?)adjustment.Amount).SumAsync() ?? 0;
            }
            Require(refunded > 0 && (o.RefundState != "Full" || refunded == ConcertRules.Amount(o.PaidAmount)), "订单退款状态需与已关联到账退款一致，扣除不可退费用应使用部分退款");
        }
        foreach (var c in b.Companions) {
            ConcertText(c.Name, 100, true); foreach (var s in new[] { c.Holder, c.Payer, c.Bearer }) ConcertText(s, 100);
            Require(c.Ratio is >= 0 and <= 100, "分摊比例须在0至100之间"); var amount = ConcertRules.Amount(c.Amount);
            if (c.CostId != null) { var cost = costs.SingleOrDefault(x => x.Id == c.CostId); Require(cost != null, "分摊须关联费用"); Require(decimal.Round(ConcertRules.Amount(cost!.Amount) * c.Ratio / 100, 2, MidpointRounding.AwayFromZero) == amount, "分摊金额须与所关联费用及比例相符"); }
            if (c.AdvanceId != null) {
                var a = await AdvanceEntity(user, c.AdvanceId); Require(a.Currency == b.Currency && a.BusinessId != null && a.Amount - a.OwnAmount == amount, "分摊须关联本人同币种代付的完整应收额");
                Require(!others.SelectMany(x => x.Companions).Any(x => x.AdvanceId == a.Id) && b.Companions.Count(x => x.AdvanceId == a.Id) == 1, "同一代付应收不能重复归属多个同行记录或场次");
                var cost = costs.SingleOrDefault(x => x.Id == c.CostId); Require(cost != null && txs[cost.TransactionId].BusinessId == a.BusinessId && txs[cost.TransactionId].Type == "ReimbursementAdvance" && ConcertRules.Amount(cost.Amount) == amount, "代付分摊须关联该代付原始垫付流水的完整本金分配");
            }
        }
        foreach (var g in b.Companions.Where(x => x.CostId != null).GroupBy(x => x.CostId)) Require(g.Sum(x => ConcertRules.Amount(x.Amount)) <= ConcertRules.Amount(costs.Single(x => x.Id == g.Key).Amount) && g.Sum(x => x.Ratio) <= 100, "同一费用的分摊总额或比例超过上限");
        foreach (var cost in costs.Where(x => txs[x.TransactionId].Type == "ReimbursementAdvance")) Require(b.Companions.Any(x => x.CostId == cost.Id && x.AdvanceId != null), "代垫本金费用必须同时关联同行者的原代买代付应收，避免将他人承担金额计为本人成本");
        var attachmentIds = b.AttachmentIds.Concat(b.Orders.SelectMany(x => x.AttachmentIds)).Distinct().ToArray();
        Require(attachmentIds.Length <= 100 && await db.Documents.CountAsync(x => x.UserId == user && attachmentIds.Contains(x.Id) && x.Kind == "ConcertAttachment" && x.Name.StartsWith(doc.Id + "/")) == attachmentIds.Length, "附件不属于当前用户和场次");
        if (old != null) {
            db.Add(new StoredDocument { UserId = user, Kind = "ConcertHistory", Name = doc.Id, ContentType = "application/json", Content = doc.Content.ToArray() }); doc.Version++;
        } else db.Add(doc);
        ConcertAudit(user, doc.Id, old == null ? "Create" : "Update", new { from = old?.State, to = b.State, version = doc.Version.ToString(), refundChanges = b.Refunds.Where(x => old?.Refunds.FirstOrDefault(r => r.Id == x.Id)?.State != x.State).Select(x => new { x.Id, from = old?.Refunds.FirstOrDefault(r => r.Id == x.Id)?.State, to = x.State }), orderChanges = b.Orders.Where(x => old?.Orders.FirstOrDefault(o => o.Id == x.Id) is not { } p || p.State != x.State || p.RefundState != x.RefundState).Select(x => new { x.Id, from = old?.Orders.FirstOrDefault(o => o.Id == x.Id)?.State, to = x.State, refundFrom = old?.Orders.FirstOrDefault(o => o.Id == x.Id)?.RefundState, refundTo = x.RefundState }) });
        if (old == null || old.StartsAt != b.StartsAt || (old.TimeZone ?? ConcertRules.DefaultTimeZone) != b.TimeZone)
            ConcertAudit(user, doc.Id, "ScheduleUpdated", new { before = old == null ? null : new { old.StartsAt, timeZone = old.TimeZone ?? ConcertRules.DefaultTimeZone }, after = new { b.StartsAt, b.TimeZone } });
        if (JsonSerializer.Serialize(old?.ArtistLink, Json) != JsonSerializer.Serialize(b.ArtistLink, Json))
            ConcertAudit(user, doc.Id, "ArtistLinkUpdated", new { before = old?.ArtistLink, after = b.ArtistLink, displayName = b.Artist });
        if (JsonSerializer.Serialize(old?.ArtistAllocation, Json) != JsonSerializer.Serialize(b.ArtistAllocation, Json))
            ConcertAudit(user,doc.Id,"ArtistSharesUpdated",new {before=old?.ArtistAllocation,after=b.ArtistAllocation});
        foreach(var cost in b.Costs) {var before=old?.Costs.FirstOrDefault(x=>x.Id==cost.Id)?.ArtistAllocation;if(JsonSerializer.Serialize(before,Json)!=JsonSerializer.Serialize(cost.ArtistAllocation,Json))ConcertAudit(user,doc.Id,"ArtistCostUpdated",new{costId=cost.Id,before,after=cost.ArtistAllocation});}
        foreach(var order in b.Orders) {var before=old?.Orders.FirstOrDefault(x=>x.Id==order.Id);if(JsonSerializer.Serialize(before?.ArtistAllocation,Json)!=JsonSerializer.Serialize(order.ArtistAllocation,Json) || JsonSerializer.Serialize(before?.Origin,Json)!=JsonSerializer.Serialize(order.Origin,Json))ConcertAudit(user,doc.Id,"OrderSourceUpdated",new{orderId=order.Id,before=new{before?.Origin,before?.ArtistAllocation},after=new{order.Origin,order.ArtistAllocation}});}
        if(JsonSerializer.Serialize(old?.Refunds??[],Json)!=JsonSerializer.Serialize(b.Refunds,Json)) ConcertAudit(user,doc.Id,"RefundsUpdated",new{before=old?.Refunds??[],after=b.Refunds});
        doc.Name = b.Title.Trim(); doc.Content = JsonSerializer.SerializeToUtf8Bytes(b, Json);
        if(old?.Closing?.State=="Closed" && b.Closing?.State=="Closed") Require(JsonSerializer.Serialize(old,Json)==JsonSerializer.Serialize(b,Json),"已结案档案请先明确重新打开，再修改资料或财务关联");
        if(b.Closing?.State=="Closed" && old?.Closing?.State!="Closed") {
            await db.SaveChangesAsync();
            var report=JsonSerializer.SerializeToElement(await ConcertReport(user,doc),Json);
            Require(!report.GetProperty("warnings").EnumerateArray().Any() && Money(report.GetProperty("pendingAdvances").GetString())==0 && Money(report.GetProperty("pendingPayables").GetString())==0 && Money(report.GetProperty("ticketTransfers").GetProperty("pendingReturn").GetString())==0 && Money(report.GetProperty("insuranceRecovery").GetProperty("pendingReturn").GetString())==0 && !b.Plans.Any(p=>p.State=="Planned") && !b.Refunds.Any(r=>r.State is "Requested" or "Approved") && !(b.Insurance??[]).Any(i=>i.State=="Open") && !report.GetProperty("ticketTransfers").GetProperty("rows").EnumerateArray().Any(r=>Money(r.GetProperty("uncollected").GetString())>0),"尚有待确认来源、退款、计划、回款或结算，不能结案");
        }
        if(JsonSerializer.Serialize(old?.Closing,Json)!=JsonSerializer.Serialize(b.Closing,Json) || JsonSerializer.Serialize(old?.Insurance,Json)!=JsonSerializer.Serialize(b.Insurance,Json)) ConcertAudit(user,doc.Id,"ClosingUpdated",new {before=new {old?.Closing,old?.Insurance},after=new {b.Closing,b.Insurance}});
        return new { doc.Id, version = doc.Version.ToString() };
    }
    public async Task<object> ConcertHistory(string user, string id)
    {
        await ConcertDoc(user, id);
        return await db.AuditRecords.AsNoTracking().Where(x => x.UserId == user && x.ResourceType == "Concert" && x.ResourceId == id).OrderByDescending(x => x.CreatedAt).Take(200).Select(x => new { x.Id, x.CreatedAt, x.Action, changes = x.ChangesJson }).ToArrayAsync();
    }
}


