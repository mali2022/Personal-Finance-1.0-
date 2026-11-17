using PersonalFinance.Api.Contracts;
using System.Text.Json.Serialization;
namespace PersonalFinance.Api.Application;

public sealed record ConcertModules(bool Concerts = false);
public sealed record ConcertBudget(string Category, string Amount);
public sealed record ConcertPaymentPart(string TransactionId, string Amount, string Fee);
public sealed record ConcertTicketGift(string From, string Recipient, DateOnly GiftedOn, string State, string Note, bool PlatformAllowed);
public sealed record ConcertTransferPayment(string TransactionId,string Amount);
public sealed record ConcertTicketTransfer(string Seller,string Buyer,DateOnly TransferredOn,string AgreedAmount,string State,ConcertTransferPayment[] Receipts,ConcertTransferPayment[] Returns,string Note,bool PlatformAllowed);
public sealed record ConcertTicket(string Id, string Tier, string Seat, string Attendee, string Format, string State,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertTicketGift? Gift = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertTicketTransfer? Transfer = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? PaidShare = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertTicketOutcome? Outcome = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? PersonalShare = null);
public sealed record ConcertTicketOutcome(string State,string Note);
public sealed record ConcertInsurance(string Id,string TicketId,string Provider,string PolicyNumber,string RequestedAmount,string State,ConcertTransferPayment[] Receipts,ConcertTransferPayment[] Returns,string Note);
public sealed record ConcertClosing(string State,DateOnly? ClosedOn,string Note);
public sealed record ConcertTicketOrigin(string Kind,string From,DateOnly? ReceivedOn,string Note,bool PlatformAllowed);
public sealed record ConcertOrder(string Id, string Platform, string Number, DateOnly? OrderedOn, DateOnly? PaidOn,
    string FacePrice, int Quantity, string PaidAmount, string Fee, string Tier, string Seat, string Holder,
    string State, string RefundState, string? PaymentTransactionId, string[] AttachmentIds, ConcertPaymentPart[]? PaymentParts = null, ConcertTicket[]? Tickets = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertArtistAllocation? ArtistAllocation = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertTicketOrigin? Origin = null);
public sealed record ConcertCost(string Id, string Category, string TransactionId, string? EntryId, string Amount, string Payer, string Bearer,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertArtistAllocation? ArtistAllocation = null);
public sealed record ConcertPlannedCost(string Id, string Category, string Title, string Amount, string State, string? CostId);
public sealed record ConcertRefund(string Id, string CostId, string State, string RequestedAmount, string NonRefundable,
    string? TransactionId, string ReceivedAmount, string Note,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? TicketId = null);
public sealed record ConcertCompanion(string Id, string Name, string Holder, string Payer, string Bearer, decimal Ratio,
    string Amount, string? AdvanceId, string? CostId);
public sealed record ConcertArtistLink(string? ArtistId);
public sealed record ConcertArtistShare(string ArtistId, decimal Ratio);
public sealed record ConcertArtistAllocation(string Mode, ConcertArtistShare[] Shares);
public sealed record ConcertInput(string Artist, string TourName, string? TourId, string Title, DateTimeOffset StartsAt,
    string City, string Venue, string SessionNumber, string Organizer, string Platform, string Currency, string TotalBudget,
    int ExpectedPeople, int ActualPeople, string Note, string State, string[] AttachmentIds,
    ConcertBudget[] Budgets, ConcertOrder[] Orders, ConcertCost[] Costs, ConcertPlannedCost[] Plans, ConcertRefund[] Refunds, ConcertCompanion[] Companions, string? TimeZone = null, ConcertArtistLink? ArtistLink = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertArtistAllocation? ArtistAllocation = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertInsurance[]? Insurance = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] ConcertClosing? Closing = null,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? EventType = null);
public sealed record ConcertAttachmentRequest(string OrderId = "");

public static class ConcertRules
{
    public const string DefaultTimeZone = "Asia/Shanghai";
    public static TimeZoneInfo Zone(string? name) {
        name ??= DefaultTimeZone;
        FinanceService.Require(name.Length is > 0 and <= 128 && (name == "UTC" || TimeZoneInfo.TryConvertIanaIdToWindowsId(name, out _)), "请输入有效的IANA时区，例如Asia/Shanghai");
        try { return TimeZoneInfo.FindSystemTimeZoneById(name); }
        catch (TimeZoneNotFoundException) { throw new ApiException(422, "系统不支持此演出时区"); }
        catch (InvalidTimeZoneException) { throw new ApiException(422, "演出时区配置无效"); }
    }
    public static DateTimeOffset LocalStart(ConcertInput scene) => TimeZoneInfo.ConvertTime(scene.StartsAt, Zone(scene.TimeZone));
    public static bool BelongsToArtist(ConcertInput scene, string artistId, string name) => EffectiveCosts(scene).Any(c=>c.ArtistAllocation?.Mode=="Split" && c.ArtistAllocation.Shares.Any(s=>s.ArtistId==artistId)) || (scene.ArtistAllocation?.Mode == "Split" ? scene.ArtistAllocation.Shares.Any(s=>s.ArtistId==artistId) : scene.ArtistLink == null ? scene.Artist == name : scene.ArtistLink.ArtistId == artistId);
    public static readonly string[] Categories = ["Ticket", "Transport", "Hotel", "Food", "Merch", "Support", "Storage", "Insurance", "Fee", "Other"];
    public static readonly string[] BudgetCategories = ["Ticket", "Transport", "Hotel", "Food", "Merch", "Other"];
    public static readonly string[] SceneStates = ["Planning", "Queuing", "Ticketed", "Upcoming", "Attended", "Cancelled", "Postponed"];
    public static readonly string[] OrderStates = ["Planning", "Queuing", "PendingPayment", "Paid", "Issued", "Used", "Cancelled", "Postponed"];
    public static readonly string[] RefundStates = ["None", "Requested", "Approved", "Partial", "Full", "Rejected"];
    public static string BudgetCategory(string category) => BudgetCategories.Contains(category) ? category : "Other";
    public static decimal Amount(string text) { var n = FinanceService.Money(text); FinanceService.Require(n >= 0, "金额不可为负"); return n; }
    public static void Transition(string oldState, string next, string kind)
    {
        if (oldState == next) return;
        string[] allowed = (kind, oldState) switch {
            ("scene", "Planning") => ["Queuing", "Ticketed", "Upcoming", "Cancelled", "Postponed"],
            ("scene", "Queuing") => ["Planning", "Ticketed", "Cancelled", "Postponed"],
            ("scene", "Ticketed") => ["Upcoming", "Attended", "Cancelled", "Postponed"],
            ("scene", "Upcoming") => ["Attended", "Cancelled", "Postponed"],
            ("scene", "Postponed") => ["Planning", "Ticketed", "Upcoming", "Cancelled"],
            ("order", "Planning") => ["Queuing", "PendingPayment", "Cancelled", "Postponed"],
            ("order", "Queuing") => ["Planning", "PendingPayment", "Cancelled", "Postponed"],
            ("order", "PendingPayment") => ["Paid", "Cancelled", "Postponed"],
            ("order", "Paid") => ["Issued", "Cancelled", "Postponed"],
            ("order", "Issued") => ["Used", "Cancelled", "Postponed"],
            ("order", "Postponed") => ["Planning", "PendingPayment", "Paid", "Issued", "Cancelled"],
            ("refund", "None") => ["Requested"],
            ("refund", "Requested") => ["Approved", "Rejected", "None"],
            ("refund", "Approved") => ["Partial", "Full", "Rejected"],
            ("refund", "Partial") => ["Full", "Requested", "Approved"],
            ("refund", "Rejected") => ["Requested"],
            _ => []
        };
        FinanceService.Require(allowed.Contains(next), "该状态不能直接跳转，请按业务流程操作");
    }
    public static bool OrderCost(string costId, string orderId) => costId == "ticket:" + orderId || costId == "fee:" + orderId || costId.StartsWith("ticket:" + orderId + ":") || costId.StartsWith("fee:" + orderId + ":");
    public static ConcertCost[] EffectiveCosts(ConcertInput c) => c.Costs.Concat(c.Orders.SelectMany(o => {
        var parts = o.PaymentParts is { Length: > 0 } ? o.PaymentParts : o.PaymentTransactionId == null ? [] : new[] { new ConcertPaymentPart(o.PaymentTransactionId, o.PaidAmount, o.Fee) };
        return parts.SelectMany((p, index) => { var suffix = o.PaymentParts is { Length: > 0 } ? ":" + index : ""; return new[] {
            new ConcertCost("ticket:" + o.Id + suffix, "Ticket", p.TransactionId, null, FinanceService.M(Amount(p.Amount) - Amount(p.Fee)), "本人", o.Holder,o.ArtistAllocation),
            new ConcertCost("fee:" + o.Id + suffix, "Fee", p.TransactionId, null, p.Fee, "本人", o.Holder,o.ArtistAllocation)
        }; }).Where(x => Amount(x.Amount) > 0);
    })).ToArray();
}
