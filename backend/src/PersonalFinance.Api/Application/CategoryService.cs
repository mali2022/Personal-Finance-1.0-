using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> ReorderCategories(string user, CategoryOrderInput input)
    {
        Require(input.Items is { Length: > 0 and <= 1000 } && input.Items.Select(x => x.Id).Distinct().Count() == input.Items.Length, "分类排序列表无效");
        var ids = input.Items.Select(x => x.Id).ToArray();
        var cats = await db.Categories.Where(x => x.UserId == user && ids.Contains(x.Id)).ToListAsync();
        Require(cats.Count == ids.Length, "分类不存在或列表已改变");
        var first = cats[0];
        Require(cats.All(x => x.ParentId == first.ParentId && x.Kind == first.Kind), "排序必须为同级同类型分类");
        var count = await db.Categories.CountAsync(x => x.UserId == user && x.ParentId == first.ParentId && x.Kind == first.Kind);
        if (count != cats.Count) throw new ApiException(409, "分类列表已改变，请刷新后重新排序", "VERSION_CONFLICT");
        foreach (var item in input.Items) Version(cats.Single(x => x.Id == item.Id), item.Version);
        for (var i = 0; i < ids.Length; i++) { var c = cats.Single(x => x.Id == ids[i]); c.SortOrder = i; c.Version++; }
        return new { reordered = true };
    }
    public async Task<object> CategoryDeletionPreview(string user, string id)
    {
        var c = await db.Categories.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "分类不存在");
        var references = await CategoryReferences(user, id);
        return new { c.Id, c.Name, version = c.Version.ToString(), canDelete = references.All(x => x.Count == 0), references };
    }
    public sealed record CategoryReference(string Kind, string Label, int Count);
    private async Task<CategoryReference[]> CategoryReferences(string user, string id)
    {
        return [
            new("children", "子分类", await db.Categories.CountAsync(x => x.UserId == user && x.ParentId == id)),
            new("transactions", "交易（含已删除记录）", await db.Transactions.CountAsync(x => x.UserId == user && (x.CategoryId == id || x.FeeCategoryId == id || x.Entries.Any(e => e.CategoryId == id)))),
            new("entries", "历史分类关联", await db.Entries.CountAsync(x => x.UserId == user && x.CategoryId == id)),
            new("budgets", "预算明细", await db.Budgets.Where(x => x.UserId == user).SelectMany(x => x.Items).CountAsync(x => x.CategoryId == id)),
            new("annualBudgets", "年度预算分配", await db.Set<AnnualBudget>().Where(x => x.UserId == user).SelectMany(x => x.Allocations).CountAsync(x => x.CategoryId == id)),
            new("carryovers", "预算结转记录", await db.Set<BudgetCarryover>().CountAsync(x => x.UserId == user && x.CategoryId == id)),
            new("essential", "必要支出设置", await db.Set<EssentialExpensePolicy>().CountAsync(x => x.UserId == user && x.CategoryId == id)),
            new("analysis", "分类分析属性", await db.Set<TransactionAnalysisAttribute>().CountAsync(x => x.UserId == user && x.CategoryId == id)),
            new("directory", "商户或记账模板", await db.Directory.CountAsync(x => x.UserId == user && x.CategoryId == id)),
            new("imports", "导入记录", await db.ImportRows.CountAsync(x => x.UserId == user && x.DataJson.Contains("\"" + id + "\""))),
            new("recurring", "周期规则及历史实例", await db.RecurringRules.CountAsync(x => x.UserId == user && (x.CategoryId == id || x.PayloadJson.Contains("\"" + id + "\""))) + await db.RecurringOccurrences.CountAsync(x => x.UserId == user && (x.PayloadJson.Contains("\"" + id + "\"" ) || x.PreparedPayloadJson != null && x.PreparedPayloadJson.Contains("\"" + id + "\"")))),
            new("automation", "自动分类规则", await db.AutomationRules.CountAsync(x => x.UserId == user && x.ActionsJson.Contains("\"" + id + "\"")))
        ];
    }
    public async Task<object> DeleteCategory(string user, string id, string? version)
    {
        var c = await db.Categories.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "分类不存在");
        Version(c, version);
        var references = await CategoryReferences(user, id);
        if (references.Any(x => x.Count > 0)) throw new ApiException(409, "分类仍有子分类或历史引用，请先处理相关设置；历史交易分类建议停用", "CATEGORY_IN_USE");
        db.Categories.Remove(c); return new { c.Id };
    }
}
