using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using Xunit;

namespace PersonalFinance.Tests;

public sealed class AuditFinanceRulesTests
{
    private static InvestmentTrade Trade(string type, int tradeDay, int settlementDay) => new()
    {
        Type = type, Date = new(2026, 1, tradeDay), SettlementDate = new(2026, 1, settlementDay), Quantity = 10, Amount = 100
    };

    [Fact]
    public void RevocationCannotLeaveAnUnsettledBuySupportingASale()
    {
        var lateBuy = Trade("Buy", 1, 10); var earlyBuy = Trade("Buy", 2, 3); var sell = Trade("Sell", 4, 4);
        Assert.Equal(10, InvestmentMath.ValidateHistory([lateBuy, earlyBuy, sell]).Quantity);
        Assert.Equal(0, InvestmentMath.Calculate([lateBuy, sell]).Quantity);
        Assert.Contains("结算历史", Assert.Throws<ApiException>(() => InvestmentMath.ValidateHistory([lateBuy, sell])).Message);
    }

    [Fact]
    public void TradeDateOversellingIsRejectedEvenWhenSettlementOrderWouldWork()
        => Assert.Throws<ApiException>(() => InvestmentMath.ValidateHistory([Trade("Sell", 1, 3), Trade("Buy", 2, 2)]));

    [Fact]
    public void RevokedTradesAreIgnoredInBothInvestmentChronologies()
    {
        var revokedSell = Trade("Sell", 1, 1); revokedSell.State = "Revoked";
        Assert.Equal(10, InvestmentMath.ValidateHistory([revokedSell, Trade("Buy", 2, 2)]).Quantity);
    }

    [Theory]
    [InlineData("Cash", true)] [InlineData("Bank", true)] [InlineData("Alipay", true)] [InlineData("WeChat", true)]
    [InlineData("ElectronicWallet", true)] [InlineData("StoredValue", false)] [InlineData("Investment", false)]
    [InlineData("CreditCard", false)] [InlineData("ConsumerCredit", false)] [InlineData("ConsumerLoan", false)]
    public void LiquidFundsHaveOneSharedAccountClassification(string type, bool expected)
        => Assert.Equal(expected, AccountKinds.IsLiquid(type));

    [Theory]
    [InlineData("Transfer", true, true, 10)] [InlineData("Transfer", true, false, 110)]
    [InlineData("Transfer", false, true, 0)] [InlineData("Income", true, false, 0)]
    [InlineData("Expense", true, false, 110)] [InlineData("CreditCardPayment", true, false, 110)]
    public void CommitmentsCancelInternalPrincipalButRetainFees(string type, bool source, bool destination, int expected)
        => Assert.Equal(expected, CashFlowMath.Commitment(type, 100, 10, source, destination));

    private static readonly DateTimeOffset Next = new(2026, 10, 15, 12, 0, 0, TimeSpan.FromHours(8));
    private static SaveTransaction Payload(string amount, bool splits = true)
        => new("Expense", amount, "account", Next, CategoryId: "category", Splits: splits ? [new("category", amount)] : null);
    private static SubscriptionPrice Price(decimal amount, int days) => new() { Amount = amount, EffectiveAt = Next.AddDays(days) };

    [Fact]
    public void FuturePriceWithFixedSplitsIsRejectedBeforeChangingTheTemplate()
        => Assert.Throws<ApiException>(() => SubscriptionPayloadRules.ValidateFixedSplits(Payload("20"), [Price(10, -1), Price(20, 2)], Next));

    [Fact]
    public void OldPricesBeforeTheGenerationCursorDoNotBlockMatchingFixedSplits()
        => SubscriptionPayloadRules.ValidateFixedSplits(Payload("20"), [Price(10, -10), Price(20, -1)], Next);

    [Fact]
    public void RemovingFixedSplitsPreservesEachOccurrencePriceWithoutReallocatingMoney()
    {
        var payload = Payload("20", false);
        SubscriptionPayloadRules.ValidateFixedSplits(payload, [Price(10, -1), Price(20, 2)], Next);
        var earlier = SubscriptionPayloadRules.AtPrice(payload, 10);
        Assert.Equal("10.00", earlier.Amount); Assert.Equal("category", earlier.CategoryId); Assert.Null(earlier.Splits);
        Assert.Equal("20.00", SubscriptionPayloadRules.AtPrice(payload, 20).Amount);
    }

    [Fact]
    public void LegacyInconsistentFixedSplitsCannotProduceAnUnconfirmableOccurrence()
        => Assert.Contains("取消固定拆分", Assert.Throws<ApiException>(() => SubscriptionPayloadRules.AtPrice(Payload("20"), 10)).Message);
}
