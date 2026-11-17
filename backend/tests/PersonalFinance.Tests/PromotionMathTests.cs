using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class PromotionMathTests
{
    [Theory] [InlineData(100, 85, 15)] [InlineData(0.03, 50, 0.02)]
    public void RateUsesDecimalAndRoundsAtCents(decimal amount, decimal rate, decimal expected) => Assert.Equal(expected, PromotionMath.RateDiscount(amount, rate, null));
    [Fact] public void RateMaximumCapsSavings() => Assert.Equal(10m, PromotionMath.RateDiscount(100m, 85m, 10m));
    [Theory] [InlineData(0)] [InlineData(100)] [InlineData(-1)]
    public void InvalidRateRejected(decimal rate) => Assert.Throws<ApiException>(() => PromotionMath.RateDiscount(100m, rate, null));
    [Fact] public void RateBaseRespectsEarlierGoodsAndShipping() => Assert.Equal(70m, PromotionMath.EligibleAmount(new("100", "CNY", [new("MerchantCoupon", "20", 0), new("ShippingDiscount", "5", 1), new("ProductDiscount", "7", 2)], "10"), new("ProductDiscount", "7", 2)));
    static PromotionInput Input(string original, params string[] discounts) => new(original, "CNY", discounts.Select((amount, order) => new PromotionLine("MerchantCoupon", amount, order)).ToArray());
    [Fact] public void StackedDiscountsAreExact() => Assert.Equal(72m, PromotionMath.Calculate(Input("100", "20", "5", "3"), "CNY"));
    [Theory] [InlineData("0", "0")] [InlineData("0.03", "0.01")] [InlineData("100", "100")]
    public void ZeroAndCents(string original, string discount) => Assert.Equal(FinanceService.Money(original) - FinanceService.Money(discount), PromotionMath.Calculate(Input(original, discount), "CNY"));
    [Fact] public void ExcessRejected() => Assert.Throws<ApiException>(() => PromotionMath.Calculate(Input("10", "11"), "CNY"));
    [Fact] public void CurrencyRejected() => Assert.Throws<ApiException>(() => PromotionMath.Calculate(Input("10", "1"), "USD"));
    [Fact] public void CashRewardRejected() => Assert.Throws<ApiException>(() => PromotionMath.Calculate(new("100", "CNY", [new("Cashback", "1", 0)]), "CNY"));
    [Fact] public void DuplicateOrderRejected() => Assert.Throws<ApiException>(() => PromotionMath.Calculate(new("100", "CNY", [new("BankDiscount", "1", 0), new("PaymentRedPacket", "1", 0)]), "CNY"));
    [Theory] [InlineData("2", "2", 0)] [InlineData("3", "2", 1)]
    public void FeeWaiver(string original, string discount, int actual) => Assert.Equal(actual, PromotionMath.Calculate(new(original, "CNY", [new("FeeWaiver", discount, 0)]), "CNY", true));
    [Fact] public void ShippingIsNotDeductedTwice() => Assert.Throws<ApiException>(() => PromotionMath.Calculate(new("100", "CNY", [new("OrderDiscount", "95", 0), new("ShippingDiscount", "5", 1)], "10"), "CNY"));
    [Fact] public void ShippingAndGoods() => Assert.Equal(75m, PromotionMath.Calculate(new("100", "CNY", [new("MerchantCoupon", "20", 0), new("ShippingDiscount", "5", 1)], "10"), "CNY"));
    [Theory] [InlineData("-1")] [InlineData("0.001")]
    public void InvalidMoneyRejected(string amount) => Assert.Throws<ApiException>(() => PromotionMath.Calculate(Input("10", amount), "CNY"));
}
