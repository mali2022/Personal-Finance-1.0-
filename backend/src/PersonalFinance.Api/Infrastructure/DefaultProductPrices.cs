using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Infrastructure;

public sealed record DefaultProductPriceItem(string Product, string Specification, string Unit, decimal Quantity, decimal Amount, string ProductCategory);
public sealed record DefaultProductPriceCatalog(string SourceId, string Title, string SourceUrl, string Market, DateOnly Date, string Currency, string PriceKind, string Description, DefaultProductPriceItem[] Items);

public static class DefaultProductPrices
{
    private static readonly Lazy<DefaultProductPriceCatalog> Catalog = new(Load);
    public static DefaultProductPriceCatalog Data => Catalog.Value;
    public static string Source => $"默认参考价｜原文平均价｜{Data.Market} {Data.Date:yyyy-MM-dd}｜{Data.SourceUrl}";
    private static DefaultProductPriceCatalog Load()
    {
        var assembly = typeof(DefaultProductPrices).Assembly;
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(x => x.EndsWith(".DefaultProductPrices.json", StringComparison.Ordinal)))!;
        var catalog = JsonSerializer.Deserialize<DefaultProductPriceCatalog>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidOperationException("默认商品价格表为空");
        if (catalog.Currency != "CNY" || catalog.PriceKind != "Listed" || catalog.Items.Length == 0 ||
            !Uri.TryCreate(catalog.SourceUrl, UriKind.Absolute, out var source) || source.Scheme != "https" ||
            catalog.Items.Any(x => string.IsNullOrWhiteSpace(x.Product) || x.Product.Length > 200 || string.IsNullOrWhiteSpace(x.Specification) || x.Specification.Length > 200 || x.Quantity <= 0 || x.Amount <= 0 || decimal.Round(x.Amount, 2) != x.Amount || x.Unit is not ("斤" or "个" or "kg" or "L")) ||
            catalog.Items.Select(x => (x.Product, x.Specification)).Distinct().Count() != catalog.Items.Length)
            throw new InvalidOperationException("默认商品价格表的人民币口径、单位、金额或唯一性无效");
        return catalog;
    }
    public static IReadOnlyList<ProductPriceObservation> Create(string user)
    {
        if (Source.Length > 200) throw new InvalidOperationException("默认商品来源说明过长");
        return Data.Items.Select(item => new ProductPriceObservation {
            Id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"default-price:{user}:{Data.SourceId}:{item.Product}:{item.Specification}"))[..16]).ToString(),
            UserId = user, Product = item.Product, Specification = item.Specification, Unit = item.Unit,
            Quantity = item.Quantity, Amount = item.Amount, Currency = Data.Currency, Date = Data.Date,
            PriceKind = Data.PriceKind, Source = Source, ProductCategory = item.ProductCategory, Merchant = Data.Market
        }).ToArray();
    }
}
