using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiCategoryCandidate(string Id, string Path);
public sealed class AiDraftMatchingService(FinanceDb db, FinanceService finance)
{
    public async Task<AiValidatedDraft> Match(string user, string text, AiValidatedDraft draft, CancellationToken ct)
    {
        var p = draft.Parsed;
        if (draft.RequiresSpecialWorkflow) return draft;
        var categories = await finance.Categories(user); var hierarchy = new CategoryHierarchy(categories);
        var valid = categories.Where(x => x.Kind == p.Intent && x.ParentId != null).Where(x => {
            try { return hierarchy.Path(x.Id).All(c => c.Status == "Active"); } catch (ApiException) { return false; }
        }).ToArray();
        var path = p.CategoryPath == null ? null : string.Join(" > ", p.CategoryPath);
        var candidates = valid.Where(x => path != null ? string.Join(" > ", hierarchy.Path(x.Id).Select(c => c.Name)).Equals(path, StringComparison.OrdinalIgnoreCase) :
            x.Name.Equals(p.CategoryHint, StringComparison.OrdinalIgnoreCase)).Select(x => new AiCategoryCandidate(x.Id, string.Join(" > ", hierarchy.Path(x.Id).Select(c => c.Name)))).Take(10).ToArray();
        var categoryId = (string?)null; var classification = "Unmatched"; var tags = new HashSet<string>(); var warnings = draft.Warnings.ToList(); var ruleConflict = false;
        if (candidates.Length == 1 && (text.Contains("分类", StringComparison.OrdinalIgnoreCase) || text.Contains("category", StringComparison.OrdinalIgnoreCase)) &&
            hierarchy.Path(candidates[0].Id).Any(c => text.Contains(c.Name, StringComparison.OrdinalIgnoreCase))) {
            categoryId = candidates[0].Id; classification = "Explicit";
        }
        if (draft.AccountId != null && p.Amount != null && p.Date != null) {
            var transaction = new SaveTransaction(p.Intent, p.Amount, draft.AccountId,
                new DateTimeOffset(DateOnly.ParseExact(p.Date, "yyyy-MM-dd").ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8)),
                Merchant: p.Merchant, CategoryId: categoryId, Note: (p.Note ?? "")[..Math.Min(200, (p.Note ?? "").Length)]);
            var suggestion = JsonSerializer.SerializeToElement(await finance.SuggestAutomation(user, new(transaction)), FinanceService.Json);
            var after = suggestion.GetProperty("after");
            var conflict = suggestion.GetProperty("conflicts").EnumerateArray().Any(x => x.GetString() == "categoryId");
            var ruleCategory = after.GetProperty("categoryId").GetString();
            if (categoryId == null && ruleCategory != null && !conflict && valid.Any(x => x.Id == ruleCategory)) { categoryId = ruleCategory; classification = "ConfirmedRule"; }
            if (conflict && categoryId == null) { ruleConflict = true; warnings.Add("分类规则存在冲突，请人工选择。"); }
            if (after.TryGetProperty("tagIds", out var tagValues) && tagValues.ValueKind == JsonValueKind.Array)
                foreach (var tag in tagValues.EnumerateArray()) if (tag.GetString() is { } id) tags.Add(id);
        }
        if (categoryId == null && !ruleConflict && !string.IsNullOrWhiteSpace(p.Merchant)) {
            var history = await db.Transactions.AsNoTracking().Where(x => x.UserId == user && x.Status == "Confirmed" && x.Type == p.Intent && x.Currency == p.Currency &&
                x.Merchant == p.Merchant && x.CategoryId != null).OrderByDescending(x => x.OccurredAt).Take(100).Select(x => x.CategoryId!).ToArrayAsync(ct);
            var ranked = history.Where(id => valid.Any(x => x.Id == id)).GroupBy(id => id).OrderByDescending(g => g.Count()).ToArray();
            if (ranked.Length > 0 && ranked[0].Count() >= 3 && ranked[0].Count() * 5 > history.Length * 4) { categoryId = ranked[0].Key; classification = "MerchantHistory"; }
        }
        if (categoryId == null && !ruleConflict && candidates.Length == 1) { categoryId = candidates[0].Id; classification = "AiSuggestion"; }
        if (p.TagHints is { Length: > 0 }) {
            var available = await db.Directory.AsNoTracking().Where(x => x.UserId == user && x.Kind == "tags" && x.Status == "Active" && p.TagHints.Contains(x.Name)).Select(x => new { x.Id, x.Name }).ToArrayAsync(ct);
            foreach (var hint in p.TagHints) { var matches = available.Where(x => x.Name.Equals(hint, StringComparison.OrdinalIgnoreCase)).ToArray();
                if (matches.Length == 1) tags.Add(matches[0].Id); else warnings.Add("标签未唯一匹配，请在表单选择现有标签。"); }
        }
        // Revalidate rule tag IDs too. No classifier is allowed to create directory records.
        var validTags = await db.Directory.AsNoTracking().Where(x => x.UserId == user && x.Kind == "tags" && x.Status == "Active" && tags.Contains(x.Id)).Select(x => x.Id).ToArrayAsync(ct);
        if (validTags.Length > 30) warnings.Add("标签建议超过30个，请在表单核对保留范围。");
        return draft with { CategoryId = categoryId, ClassificationSource = classification, TagIds = validTags.Take(30).ToArray(), CategoryCandidates = candidates,
            Warnings = warnings.Distinct().ToArray() };
    }
}
