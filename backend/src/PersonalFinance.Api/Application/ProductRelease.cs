using System.Text.Json;
namespace PersonalFinance.Api.Application;
public static class ProductRelease {
    public static JsonElement Current { get; } = Read();
    private static JsonElement Read() {
        using var stream = typeof(ProductRelease).Assembly.GetManifestResourceStream("PersonalFinance.ReleaseCatalog.json") ?? throw new InvalidOperationException("Missing release metadata");
        using var doc = JsonDocument.Parse(stream);
        var product = doc.RootElement.GetProperty("product");
        if (product.GetProperty("releaseNumber").GetString() != doc.RootElement.GetProperty("currentVersion").GetString()) throw new InvalidOperationException("Inconsistent product release");
        return product.Clone();
    }
}
