using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record CategoryImportOutcome(int Row, string Name, string ParentPath, string Status, string State, string? Reason);
public sealed record CategoryImportCreate(int Row, string Name, string? ParentId, int? ParentRow, string Status, string Path);
public sealed record CategoryImportPlan(CategoryImportOutcome[] Rows, int Ready, int Duplicates, int Errors, CategoryImportCreate[] Creates);
public sealed record CategoryDeletionRow(string Id, string Version, string Name, string Path, int Depth, bool Allowed, string? Reason);

// Import is a pure function of the file plus the stored categories, so preview and confirm cannot drift apart.
public static class CategoryImportRules
{
    public const int MaxRows = 1000;
    public const int MaxNameLength = 100;

    public static CategoryImportPlan Plan(CategoryImportInput input, IReadOnlyList<Category> existing)
    {
        FinanceService.Require(input.Kind is "Expense" or "Income", "分类类型无效");
        FinanceService.Require(input.Rows is { Length: > 0 and <= MaxRows }, "请提供1至1000行分类");
        var sameKind = existing.Where(x => x.Kind == input.Kind).ToList();
        var byId = sameKind.ToDictionary(x => x.Id);
        var stored = new Dictionary<string, Category>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in sameKind) stored.TryAdd(PathOf(category, byId), category);
        var rows = new List<CategoryImportOutcome>();
        var creates = new List<CategoryImportCreate>();
        var pending = new Dictionary<string, (int Row, string Status)>(StringComparer.OrdinalIgnoreCase);
        int ready = 0, duplicates = 0, errors = 0;
        foreach (var row in input.Rows)
        {
            var number = row is { Row: > 0 } ? row.Row : rows.Count + 2;
            var name = (row?.Name ?? "").Trim();
            var status = (row?.Status ?? "").Trim();
            if (status.Length == 0) status = "启用";
            var parentPath = NormalizePath(row?.ParentPath);
            string? reason = null;
            if (name.Length is 0 or > MaxNameLength) reason = "分类名称必填，最多100字";
            else if (status is not ("启用" or "停用")) reason = "状态只能填启用或停用";
            else if (parentPath is null) reason = "父级分类格式无效";
            else if (parentPath.Split('/').Length > 2) reason = "分类最多支持三级";
            string? parentId = null;
            int? parentRow = null;
            if (reason is null && parentPath!.Length > 0)
            {
                if (stored.TryGetValue(parentPath, out var parent))
                {
                    if (parent.Status != "Active") reason = "上级分类已停用";
                    else parentId = parent.Id;
                }
                else if (pending.TryGetValue(parentPath, out var queued))
                {
                    if (queued.Status != "启用") reason = "上级分类已停用";
                    else parentRow = queued.Row;
                }
                else reason = "父级分类不存在：" + parentPath;
            }
            var path = parentPath is { Length: > 0 } ? parentPath + "/" + name : name;
            string state;
            if (reason is not null) { state = "Error"; errors++; }
            else if (stored.ContainsKey(path) || pending.ContainsKey(path))
            {
                state = "Duplicate";
                reason = stored.ContainsKey(path) ? "同名分类已存在" : "与文件内其它行重名";
                duplicates++;
            }
            else
            {
                state = "Ready";
                ready++;
                pending[path] = (number, status);
                creates.Add(new CategoryImportCreate(number, name, parentId, parentRow, status == "启用" ? "Active" : "Disabled", path));
            }
            rows.Add(new CategoryImportOutcome(number, name, parentPath ?? "", status, state, reason));
        }
        return new CategoryImportPlan(rows.ToArray(), ready, duplicates, errors, creates.ToArray());
    }

    internal static string PathOf(Category category, IReadOnlyDictionary<string, Category> byId)
    {
        var parts = new List<string>();
        var current = category;
        for (var guard = 0; guard < 8; guard++)
        {
            parts.Insert(0, current.Name);
            if (current.ParentId is null || !byId.TryGetValue(current.ParentId, out var parent)) break;
            current = parent;
        }
        return string.Join('/', parts);
    }

    private static string? NormalizePath(string? raw)
    {
        var text = (raw ?? "").Trim().Trim('/');
        if (text.Length == 0) return "";
        var parts = text.Split('/');
        if (parts.Length > 4) return null;
        var segments = new List<string>(parts.Length);
        foreach (var part in parts)
        {
            var segment = part.Trim();
            if (segment.Length is 0 or > MaxNameLength) return null;
            segments.Add(segment);
        }
        return string.Join('/', segments);
    }
}

public sealed partial class FinanceService
{
    public async Task<object> CategoryImportPreview(string user, CategoryImportInput input)
    {
        Require(input.Kind is "Expense" or "Income", "分类类型无效");
        var existing = await db.Categories.AsNoTracking().Where(x => x.UserId == user && x.Kind == input.Kind).ToListAsync();
        var plan = CategoryImportRules.Plan(input, existing);
        return new { total = plan.Rows.Length, ready = plan.Ready, duplicates = plan.Duplicates, errors = plan.Errors, items = plan.Rows };
    }

    public async Task<object> ImportCategories(string user, CategoryImportInput input)
    {
        Require(input.Kind is "Expense" or "Income", "分类类型无效");
        var existing = await db.Categories.Where(x => x.UserId == user && x.Kind == input.Kind).ToListAsync();
        var plan = CategoryImportRules.Plan(input, existing);
        var nextSort = existing.GroupBy(x => x.ParentId ?? "").ToDictionary(g => g.Key, g => g.Max(x => x.SortOrder));
        var created = new List<Category>();
        var createdByRow = new Dictionary<int, Category>();
        foreach (var create in plan.Creates)
        {
            var parentId = create.ParentId;
            if (parentId is null && create.ParentRow is int parentRow && createdByRow.TryGetValue(parentRow, out var parent)) parentId = parent.Id;
            var sortKey = parentId ?? "";
            var order = nextSort.TryGetValue(sortKey, out var last) ? last + 1 : 0;
            nextSort[sortKey] = order;
            var category = new Category { UserId = user, Name = create.Name, ParentId = parentId, Kind = input.Kind, Status = create.Status, SortOrder = order };
            db.Categories.Add(category);
            createdByRow[create.Row] = category;
            created.Add(category);
        }
        var skipped = plan.Rows.Where(x => x.State != "Ready").Select(x => new { row = x.Row, name = x.Name, reason = x.Reason }).ToArray();
        return new { imported = created.Count, skipped };
    }

    public async Task<object> CategoryBulkDeletionPreview(string user, CategoryKindInput input)
    {
        var (_, rows) = await BuildCategoryDeletion(user, input.Kind);
        return new { total = rows.Length, allowed = rows.Count(x => x.Allowed), blocked = rows.Count(x => !x.Allowed), items = rows };
    }

    public async Task<object> DeleteCategories(string user, CategoryBatchDelete input)
    {
        Require(input.Items is { Length: > 0 and <= 20000 }, "请选择要删除的分类");
        var items = input.Items!;
        Require(items.All(x => x != null && !string.IsNullOrWhiteSpace(x.Id) && !string.IsNullOrWhiteSpace(x.Version)) && items.Select(x => x.Id).Distinct().Count() == items.Length, "删除列表无效或包含重复分类");
        var (records, rows) = await BuildCategoryDeletion(user, input.Kind);
        var byId = records.ToDictionary(x => x.Id);
        Require(items.All(x => byId.ContainsKey(x.Id)), "部分分类不存在或不可访问，请刷新后重新选择");
        foreach (var item in items) Version(byId[item.Id], item.Version);
        var allowed = rows.Where(x => x.Allowed).Select(x => x.Id).ToHashSet(StringComparer.Ordinal);
        var depth = rows.ToDictionary(x => x.Id, x => x.Depth);
        // The self-referencing parent key has no cascade, so deepest levels are removed first.
        foreach (var level in records.Where(x => allowed.Contains(x.Id)).GroupBy(x => depth[x.Id]).OrderByDescending(g => g.Key))
        {
            db.Categories.RemoveRange(level);
            await db.SaveChangesAsync();
        }
        return new { deleted = allowed.Count, skipped = rows.Where(x => !x.Allowed).ToArray() };
    }

    private async Task<(List<Category> Records, CategoryDeletionRow[] Rows)> BuildCategoryDeletion(string user, string kind)
    {
        Require(kind is "Expense" or "Income", "分类类型无效");
        var records = await db.Categories.Where(x => x.UserId == user && x.Kind == kind).OrderBy(x => x.SortOrder).ThenBy(x => x.Name).ToListAsync();
        Require(records.Count <= 20000, "分类超过20000条，请分批处理");
        var byId = records.ToDictionary(x => x.Id);
        var paths = records.ToDictionary(x => x.Id, x => CategoryImportRules.PathOf(x, byId));
        var depth = paths.ToDictionary(x => x.Key, x => x.Value.Split('/').Length);
        var children = records.Where(x => x.ParentId != null).GroupBy(x => x.ParentId!).ToDictionary(g => g.Key, g => g.Select(x => x.Id).ToArray());
        var references = await CategoryReferenceLabels(user, records.Select(x => x.Id).ToHashSet(StringComparer.Ordinal));
        var blocked = new Dictionary<string, string?>(StringComparer.Ordinal);
        foreach (var category in records.OrderByDescending(x => depth[x.Id]).ThenBy(x => x.Id, StringComparer.Ordinal))
        {
            var reasons = new List<string>();
            if (references.TryGetValue(category.Id, out var labels)) reasons.Add("仍被" + string.Join("、", labels) + "引用");
            if (children.TryGetValue(category.Id, out var ids) && ids.Any(x => blocked[x] is not null)) reasons.Add("子分类未删除");
            blocked[category.Id] = reasons.Count == 0 ? null : string.Join("；", reasons);
        }
        var rows = records
            .OrderBy(x => depth[x.Id]).ThenBy(x => x.SortOrder).ThenBy(x => x.Name)
            .Select(x => new CategoryDeletionRow(x.Id, x.Version.ToString(CultureInfo.InvariantCulture), x.Name, paths[x.Id], depth[x.Id], blocked[x.Id] is null, blocked[x.Id]))
            .ToArray();
        return (records, rows);
    }

    private async Task<Dictionary<string, string[]>> CategoryReferenceLabels(string user, HashSet<string> ids)
    {
        var labels = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        if (ids.Count == 0) return labels.ToDictionary(x => x.Key, x => x.Value.ToArray());
        Tag(values: await db.Transactions.Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "交易（含已删除记录）");
        Tag(await db.Transactions.Where(x => x.UserId == user && x.FeeCategoryId != null).Select(x => x.FeeCategoryId!).Distinct().ToListAsync(), "交易（含已删除记录）");
        Tag(await db.Entries.Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "历史分类关联");
        Tag(await db.Budgets.Where(x => x.UserId == user).SelectMany(x => x.Items).Where(x => x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "预算明细");
        Tag(await db.Set<AnnualBudget>().Where(x => x.UserId == user).SelectMany(x => x.Allocations).Where(x => x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "年度预算分配");
        Tag(await db.Set<BudgetCarryover>().Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "预算结转记录");
        Tag(await db.Set<EssentialExpensePolicy>().Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "必要支出设置");
        Tag(await db.Set<TransactionAnalysisAttribute>().Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "分类分析属性");
        Tag(await db.Directory.Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "商户或记账模板");
        Tag(await db.RecurringRules.Where(x => x.UserId == user && x.CategoryId != null).Select(x => x.CategoryId!).Distinct().ToListAsync(), "周期规则及历史实例");
        Payloads(await db.ImportRows.Where(x => x.UserId == user).Select(x => x.DataJson).ToListAsync(), "导入记录");
        Payloads(await db.AutomationRules.Where(x => x.UserId == user).Select(x => x.ActionsJson).ToListAsync(), "自动分类规则");
        var recurring = await db.RecurringRules.Where(x => x.UserId == user).Select(x => x.PayloadJson).ToListAsync();
        recurring.AddRange(await db.RecurringOccurrences.Where(x => x.UserId == user).Select(x => x.PayloadJson).ToListAsync());
        recurring.AddRange(await db.RecurringOccurrences.Where(x => x.UserId == user && x.PreparedPayloadJson != null).Select(x => x.PreparedPayloadJson!).ToListAsync());
        Payloads(recurring, "周期规则及历史实例");
        return labels.ToDictionary(x => x.Key, x => x.Value.ToArray());

        void Tag(IEnumerable<string?> values, string label)
        {
            foreach (var value in values)
            {
                if (value is null || !ids.Contains(value)) continue;
                if (!labels.TryGetValue(value, out var list)) labels[value] = list = [];
                if (!list.Contains(label)) list.Add(label);
            }
        }
        void Payloads(IEnumerable<string> payloads, string label)
        {
            var found = new HashSet<string>(StringComparer.Ordinal);
            foreach (var payload in payloads)
            {
                try
                {
                    using var json = JsonDocument.Parse(payload);
                    Walk(json.RootElement);
                }
                catch (JsonException) { }
            }
            Tag(found, label);
            void Walk(JsonElement element)
            {
                if (element.ValueKind == JsonValueKind.String)
                {
                    var value = element.GetString();
                    if (value is not null && ids.Contains(value)) found.Add(value);
                }
                else if (element.ValueKind == JsonValueKind.Array) foreach (var child in element.EnumerateArray()) Walk(child);
                else if (element.ValueKind == JsonValueKind.Object) foreach (var property in element.EnumerateObject()) Walk(property.Value);
            }
        }
    }
}
