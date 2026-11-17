using PersonalFinance.Api.Infrastructure;
using Xunit;

public sealed class DefaultProductPricesTests
{
    [Fact]
    public void OriginalAveragePricesKeepCurrencyDateAndUnits()
    {
        var data = DefaultProductPrices.Data;
        Assert.Equal(90, data.Items.Length);
        Assert.Equal("CNY", data.Currency);
        Assert.Equal("Listed", data.PriceKind);
        Assert.Equal(new DateOnly(2026, 11, 3), data.Date);
        Assert.Equal("https://mp.weixin.qq.com/s/Hp-trSn7K-nTiOqd1EfjmA", data.SourceUrl);
        Assert.Equal(34, data.Items.Count(x => x.ProductCategory == "蔬菜"));
        Assert.Equal(15, data.Items.Count(x => x.ProductCategory == "水果"));
        Assert.Equal(25, data.Items.Count(x => x.ProductCategory == "肉蛋水产"));
        Assert.Equal(16, data.Items.Count(x => x.ProductCategory == "粮油"));
        var radish = data.Items.Single(x => x.Product == "白萝卜");
        Assert.Equal("斤", radish.Unit); Assert.Equal(1.05m, radish.Amount); Assert.Equal(1m, radish.Quantity);
        var fruit = data.Items.Single(x => x.Product == "火龙果（白）");
        Assert.Equal("个", fruit.Unit); Assert.Equal(5m, fruit.Amount);
        var flour = data.Items.Single(x => x.Product == "五得利");
        Assert.Equal("kg", flour.Unit); Assert.Equal(25m, flour.Quantity); Assert.Equal(82m, flour.Amount); Assert.Equal(3.28m, flour.Amount / flour.Quantity);
        var oil = data.Items.Single(x => x.Product == "鲁花花生油");
        Assert.Equal("L", oil.Unit); Assert.Equal(5m, oil.Quantity); Assert.Equal(145m, oil.Amount);
    }
    [Fact]
    public void DefaultsAreUserScopedStableReferenceSamplesWithoutLedgerLinks()
    {
        var first = DefaultProductPrices.Create("alice");
        var repeat = DefaultProductPrices.Create("alice");
        var second = DefaultProductPrices.Create("bob");
        Assert.Equal(first.Select(x => x.Id), repeat.Select(x => x.Id));
        Assert.Empty(first.Select(x => x.Id).Intersect(second.Select(x => x.Id)));
        Assert.All(first, x => { Assert.Equal("alice", x.UserId); Assert.Null(x.SourceTransactionId); Assert.Null(x.ListedAmount); Assert.Equal("Listed", x.PriceKind); Assert.Contains(DefaultProductPrices.Data.SourceUrl, x.Source); });
    }
}
