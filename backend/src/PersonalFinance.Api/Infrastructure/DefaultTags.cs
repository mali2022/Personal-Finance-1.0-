using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Infrastructure;

public sealed record DefaultTag(string Code, string Name, string Group, int GroupOrder);
public sealed record DefaultTagCatalog(string Version, DefaultTag[] Items);
public static class DefaultTags
{
    private static readonly Lazy<DefaultTagCatalog> Catalog = new(Load);
    private static readonly Lazy<IReadOnlyDictionary<string, DefaultTag>> Names = new(() => Data.Items.ToDictionary(x => x.Name, StringComparer.OrdinalIgnoreCase));
    public static DefaultTagCatalog Data => Catalog.Value;
    public static DefaultTag? Find(string name) => Names.Value.GetValueOrDefault(name);
    public static string[] Groups => Data.Items.OrderBy(x => x.GroupOrder).Select(x => x.Group).Distinct().ToArray();
    private static DefaultTagCatalog Load()
    {
        var assembly = typeof(DefaultTags).Assembly;
        using var stream = assembly.GetManifestResourceStream(assembly.GetManifestResourceNames().Single(x => x.EndsWith(".DefaultTags.json", StringComparison.Ordinal)))!;
        var data = JsonSerializer.Deserialize<DefaultTagCatalog>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidOperationException("默认标签库为空");
        if (data.Items.Length != 600 || data.Items.Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase).Count() != 600 ||
            !data.Items.Select(x => x.Code).SequenceEqual(Enumerable.Range(1, 600).Select(x => x.ToString("D3"))) ||
            data.Items.Where((x, index) => x.GroupOrder != index / 20 + 1 || string.IsNullOrWhiteSpace(x.Name) || x.Name.Length > 150 || string.IsNullOrWhiteSpace(x.Group)).Any() ||
            data.Items.GroupBy(x => x.Group).Count() != 30 || data.Items.GroupBy(x => x.Group).Any(x => x.Count() != 20))
            throw new InvalidOperationException("默认标签编号、名称或分组无效");
        return data;
    }
    public static IReadOnlyList<DirectoryItem> Create(string user) => Data.Items.Select(tag => new DirectoryItem {
        Id = new Guid(SHA256.HashData(Encoding.UTF8.GetBytes($"default-tag:{user}:{Data.Version}:{tag.Code}"))[..16]).ToString(),
        UserId = user, Kind = "tags", Name = tag.Name, Currency = "CNY", Status = "Active"
    }).ToArray();
    public static IReadOnlyList<DirectoryItem> Missing(string user, IEnumerable<string> existingNames)
    {
        var existing = existingNames.ToHashSet(StringComparer.OrdinalIgnoreCase);
        // A user may have renamed a seeded tag while retaining its ID and history.
        // A missing default name therefore needs a fresh ID, not the old seed ID.
        return Create(user).Where(x => !existing.Contains(x.Name)).Select(x => { x.Id = Guid.NewGuid().ToString(); return x; }).ToArray();
    }
}
