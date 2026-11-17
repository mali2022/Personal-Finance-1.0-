using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed class CategoryHierarchy(IEnumerable<Category> categories)
{
    private readonly Dictionary<string, Category> items = categories.ToDictionary(x => x.Id);
    public Category[] Path(string id)
    {
        var result = new List<Category>(); var seen = new HashSet<string>();
        while (items.TryGetValue(id, out var category))
        {
            if (!seen.Add(id)) throw new ApiException(422, "分类存在循环引用");
            result.Add(category);
            if (category.ParentId == null) break;
            id = category.ParentId;
        }
        if (result.Count > 0 && result[^1].ParentId != null) throw new ApiException(422, "分类上级不存在");
        result.Reverse(); return result.ToArray();
    }
    public bool Contains(string ancestor, string? id) => id != null && Path(id).Any(x => x.Id == ancestor);
    public string[] Descendants(string id) => items.Keys.Where(x => Contains(id, x)).ToArray();
    public bool Overlaps(IEnumerable<string> ids)
    {
        var selected = ids.ToHashSet();
        return selected.Any(id => Path(id).SkipLast(1).Any(x => selected.Contains(x.Id)));
    }
    public string? Bucket(string id, string? parent)
    {
        var path = Path(id);
        if (parent == null) return path.FirstOrDefault()?.Id;
        var index = Array.FindIndex(path, x => x.Id == parent);
        return index < 0 ? null : path[Math.Min(index + 1, path.Length - 1)].Id;
    }
}
