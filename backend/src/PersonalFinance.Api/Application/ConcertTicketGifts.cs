namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService {
    static ConcertTicketGift? ValidateTicketGift(ConcertInput scene,ConcertOrder order,ConcertTicket ticket,ConcertTicket? previous) {
        var gift=ticket.Gift??previous?.Gift;if(gift==null) return null;
        ConcertText(gift.From,100,true);ConcertText(gift.Recipient,100,true);ConcertText(gift.Note,1000);
        gift=gift with{From=gift.From.Trim(),Recipient=gift.Recipient.Trim()};
        Require(!gift.From.Equals(gift.Recipient,StringComparison.OrdinalIgnoreCase),"赠送人和接收人不能相同，请使用可区分的姓名或昵称");
        Require(gift.State is "Given" or "Revoked","赠送记录状态无效");
        var today=DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,ConcertRules.Zone(scene.TimeZone)).DateTime);
        Require(gift.GiftedOn.Year is >=1900 and <=9900 && gift.GiftedOn<=today,"赠送日期应为演出当地已发生日期");
        if(previous?.Gift==null || gift.State=="Given" && gift!=previous.Gift) {
            Require(ticket.State is "Received" or "Used" && order.State is "Issued" or "Used","仅已出票且已领取或已使用的门票可补录赠送");
        }
        Require(gift.State!="Given" || gift.GiftedOn<=DateOnly.FromDateTime(ConcertRules.LocalStart(scene).DateTime),"赠送日期不能晚于演出当地日期");
        Require(gift.State!="Given" || gift.PlatformAllowed,"请确认该赠送符合票务平台规则；系统不代为核验或执行转赠");
        return gift;
    }
}
