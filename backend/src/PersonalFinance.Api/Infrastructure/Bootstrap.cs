using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Infrastructure;

public static class Bootstrap
{
    // 新账本的默认分类树来自 Infrastructure/DefaultCategories.json（编译为嵌入资源）。
    // 要更换默认分类：替换该 JSON 后重新构建即可，无需改代码。
    private const string DefaultCategoriesResourceSuffix = "DefaultCategories.json";

    private sealed class DefaultCategory
    {
        public string Name { get; set; } = "";
        public string Kind { get; set; } = "Expense";
        public int SortOrder { get; set; }
        public List<DefaultChild> Children { get; set; } = [];
    }

    private sealed class DefaultChild
    {
        public string Name { get; set; } = "";
        public int SortOrder { get; set; }
    }

    private static readonly Lazy<IReadOnlyList<DefaultCategory>> Defaults = new(LoadDefaults);

    private static IReadOnlyList<DefaultCategory> LoadDefaults()
    {
        var assembly = typeof(Bootstrap).Assembly;
        // 不硬编码资源名，按后缀匹配，避免根命名空间变化后静默失效
        var name = Array.Find(assembly.GetManifestResourceNames(),
            x => x.EndsWith(DefaultCategoriesResourceSuffix, StringComparison.Ordinal))
            ?? throw new InvalidOperationException($"程序集内缺少 {DefaultCategoriesResourceSuffix} 资源");
        using var stream = assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"无法读取嵌入资源 {name}");
        var items = JsonSerializer.Deserialize<List<DefaultCategory>>(stream,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidOperationException("默认分类数据无法解析");
        if (items.Count == 0) throw new InvalidOperationException("默认分类数据为空");
        foreach (var parent in items)
        {
            if (string.IsNullOrWhiteSpace(parent.Name)) throw new InvalidOperationException("默认分类存在空名称");
            if (parent.Kind is not ("Expense" or "Income")) throw new InvalidOperationException($"默认分类「{parent.Name}」的 Kind 无效：{parent.Kind}");
            foreach (var child in parent.Children)
                if (string.IsNullOrWhiteSpace(child.Name)) throw new InvalidOperationException($"默认分类「{parent.Name}」下存在空子分类名称");
        }
        return items;
    }

    public static async Task Initialize(FinanceDb db, IConfiguration config, string root)
    {
        var email = config["Bootstrap:Email"] ?? "owner@personal.finance";
        email = email.Trim().ToLowerInvariant();
        var existing = await db.Users.SingleOrDefaultAsync(x => x.Email == email);
        if (existing is not null) {
            if (!await db.Users.AnyAsync(x => x.IsAdmin)) { existing.IsAdmin = true; await db.SaveChangesAsync(); }
            return;
        }
        var password = config["Bootstrap:Password"] ?? Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        if (password.Length < 12) throw new InvalidOperationException("初始化密码至少12字符");
        var user = new AppUser { IsAdmin = true, Email = email.ToLowerInvariant(), DisplayName = "我的账本" }; user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, password); db.Users.Add(user);
        SeedDefaults(db, user, true);
        await db.SaveChangesAsync();
        if (config["Bootstrap:Password"] is null) await File.WriteAllTextAsync(Path.Combine(root, Path.GetFileName(config["Bootstrap:CredentialsFile"] ?? "bootstrap-credentials.local.json")), System.Text.Json.JsonSerializer.Serialize(new { email, password }));
    }
    public static void SeedDefaults(FinanceDb db, AppUser user, bool includeAccounts = false)
    {
        db.Set<ProductPriceObservation>().AddRange(DefaultProductPrices.Create(user.Id));
        db.Directory.AddRange(DefaultTags.Create(user.Id));
        db.Rules.Add(new() { UserId = user.Id });
        if (includeAccounts) foreach (var (name, type) in new[] { ("现金", "Cash"), ("银行卡", "Bank"), ("支付宝", "Alipay"), ("微信", "WeChat"), ("信用卡", "CreditCard") })
            db.Accounts.Add(new() { UserId = user.Id, Name = name, Type = type, CreditLimit = type == "CreditCard" ? 20000 : null, StatementDay = type == "CreditCard" ? 20 : null, PaymentDay = type == "CreditCard" ? 10 : null });
        // 子分类继承父级的收支方向；SortOrder 沿用导出时的取值，保证展示顺序与原账本一致
        foreach (var parent in Defaults.Value)
        {
            var entity = new Category { UserId = user.Id, Name = parent.Name, Kind = parent.Kind, SortOrder = parent.SortOrder };
            db.Categories.Add(entity);
            foreach (var child in parent.Children)
                db.Categories.Add(new() { UserId = user.Id, Name = child.Name, Kind = parent.Kind, ParentId = entity.Id, SortOrder = child.SortOrder });
        }
    }
}
