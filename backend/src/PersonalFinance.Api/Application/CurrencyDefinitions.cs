using System.Text.Json;
namespace PersonalFinance.Api.Application;
public static class CurrencyDefinitions
{
    public sealed record Currency(string Code, string Name, string InternationalName, string Symbol);
    public static readonly Currency[] Items = Load();
    private static Currency[] Load() {
        using var stream = typeof(CurrencyDefinitions).Assembly.GetManifestResourceStream("PersonalFinance.CurrencyCatalog.json")!;
        return JsonSerializer.Deserialize<Currency[]>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }
    public static bool Supports(string? code) => Items.Any(x => x.Code == code);
}
