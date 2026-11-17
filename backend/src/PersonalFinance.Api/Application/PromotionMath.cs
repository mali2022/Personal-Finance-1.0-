using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

// Direct price adjustments only. Cash rewards and stored cash must use ledger services.
public static class PromotionMath
{
    public static readonly string[] Types = ["ProductDiscount", "MerchantCoupon", "PlatformCoupon", "PromoCode", "OrderDiscount", "PaymentRedPacket", "BankDiscount", "CreditCardDiscount", "PlatformSubsidy", "ShippingDiscount", "PointDeduction", "GiftCredit", "OtherDiscount", "FeeWaiver"];
    public static decimal RateDiscount(decimal eligible, decimal rate, decimal? maximum)
    {
        FinanceService.Require(eligible >= 0 && rate > 0 && rate < 100 && (maximum == null || maximum > 0), "折扣后支付比例须大于0、小于100；封顶金额须大于0");
        var discount = decimal.Round(eligible * (100 - rate) / 100, 2, MidpointRounding.AwayFromZero);
        return Math.Min(discount, maximum ?? discount);
    }
    public static decimal EligibleAmount(PromotionInput input, PromotionLine line)
    {
        var shipping = FinanceService.Money(input.ShippingAmount); var goods = FinanceService.Money(input.OriginalAmount) - shipping;
        foreach (var preceding in input.Lines.Where(x => x.Order < line.Order)) { if (preceding.Type == "ShippingDiscount") shipping -= FinanceService.Money(preceding.Amount); else goods -= FinanceService.Money(preceding.Amount); }
        return line.Type == "ShippingDiscount" ? shipping : goods;
    }
    public static decimal Calculate(PromotionInput input, string currency, bool fee = false)
    {
        FinanceService.Require(input.Currency == currency && CurrencyDefinitions.Supports(currency), "优惠币种必须与付款账户一致");
        var original = FinanceService.Money(input.OriginalAmount);
        var shipping = FinanceService.Money(input.ShippingAmount);
        FinanceService.Require(original >= 0 && shipping >= 0 && shipping <= original, "原价或运费无效");
        FinanceService.Require(input.Lines is { Length: > 0 and <= 30 }, "优惠明细须为1至30项");
        FinanceService.Require(input.Lines.All(x => x != null && x.Type != null && x.Source != null && x.Activity != null && x.Note != null), "优惠行及来源信息不能为null");
        FinanceService.Require(input.Lines.Select(x => x.Order).Distinct().Count() == input.Lines.Length, "优惠应用顺序不可重复");
        var goods = original - shipping;
        foreach (var line in input.Lines.OrderBy(x => x.Order))
        {
            FinanceService.Require(Types.Contains(line.Type) && (fee ? line.Type == "FeeWaiver" : line.Type != "FeeWaiver"), "优惠类型不适用于该交易");
            FinanceService.Require(line.Order >= 0 && line.Source.Length <= 200 && line.Activity.Length <= 200 && line.Note.Length <= 500, "优惠信息无效或过长");
            var amount = FinanceService.Money(line.Amount);
            FinanceService.Require(amount >= 0, "优惠金额不可为负");
            if (line.Type == "ShippingDiscount") { FinanceService.Require(amount <= shipping, "运费优惠超过剩余运费"); shipping -= amount; }
            else { FinanceService.Require(amount <= goods, "优惠超过剩余商品金额；运费须单独减免"); goods -= amount; }
        }
        return goods + shipping;
    }
}
