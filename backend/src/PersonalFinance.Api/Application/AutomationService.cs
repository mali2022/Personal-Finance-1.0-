using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed partial class FinanceService
{
    private static object AutomationDto(AutomationRule r) => new { r.Id, r.Name, r.State, r.Priority, r.PreviewOnly, r.HitCount, conditions = JsonSerializer.Deserialize<AutomationConditions>(r.ConditionsJson, Json), actions = JsonSerializer.Deserialize<AutomationActions>(r.ActionsJson, Json), r.CreatedAt, r.UpdatedAt, version = r.Version.ToString() };
    private async Task ValidateActions(string user, AutomationActions a, string? type)
    {
        if (a.CategoryId is not null)
        {
            var category = await db.Categories.SingleOrDefaultAsync(x => x.UserId == user && x.Id == a.CategoryId) ?? throw new ApiException(422, "分类不存在");
            await Category(user, a.CategoryId, type is "Expense" or "Income" ? type : category.Kind);
            Require(type != "Transfer", "转账规则不能设置普通收支分类");
        }
        Require((a.Merchant?.Length ?? 0) <= 200 && (a.Note?.Length ?? 0) <= 2000 && (a.TagIds?.Length ?? 0) <= 30, "规则动作内容过长");
        foreach (var tag in a.TagIds ?? []) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == tag && x.Kind == "tags" && x.Status == "Active"), "标签不存在或已停用");
        foreach (var (id, kind) in new[] { (a.ProjectId, "projects"), (a.TemplateId, "templates") })
            if (id is not null) Require(await db.Directory.AnyAsync(x => x.UserId == user && x.Id == id && x.Kind == kind && x.Status == "Active"), "项目或模板不存在或已停用");
    }
    public async Task<object> SaveAutomation(string user, AutomationInput b, string? id, string? version)
    {
        Require(b.Name.Trim().Length is > 0 and <= 150 && b.Priority is >= 0 and <= 100000 && b.State is "Active" or "Disabled", "规则名称、优先级或状态无效");
        var c = b.Conditions; Require(c.Type is null or "Expense" or "Income" or "Transfer", "交易类型无效"); Require(c.Currency == null || CurrencyDefinitions.Supports(c.Currency), "币种无效"); Require(c.Source is null or "Recurring" or "Manual", "仅支持周期实例或手动记账草稿来源");
        Require(c.Start is null || c.End is null || c.Start <= c.End, "日期范围无效");
        Require(b.Actions.CategoryId is null || c.Type is "Expense" or "Income", "设置分类的规则必须限定支出或收入类型");
        if (c.MinimumAmount is not null) Require(Money(c.MinimumAmount) >= 0, "最低金额不能为负数");
        if (c.MaximumAmount is not null) Require(Money(c.MaximumAmount) >= 0, "最高金额不能为负数");
        Require(c.MinimumAmount is null || c.MaximumAmount is null || Money(c.MinimumAmount) <= Money(c.MaximumAmount), "金额区间无效");
        Require(new[] { c.MerchantExact, c.MerchantKeyword, c.NoteKeyword }.All(x => x is null || x.Length is > 0 and <= 200), "关键词必须为1至200字");
        if (c.AccountId is not null) await Account(user, c.AccountId);
        await ValidateActions(user, b.Actions, c.Type);
        Require(b.Actions.CategoryId is not null || b.Actions.Merchant is not null || b.Actions.ProjectId is not null || b.Actions.Note is not null || b.Actions.TemplateId is not null || b.Actions.TagIds?.Length > 0, "请至少指定一项动作");
        var r = id is null ? new AutomationRule { UserId = user } : await db.AutomationRules.SingleOrDefaultAsync(x => x.UserId == user && x.Id == id) ?? throw new ApiException(404, "规则不存在");
        if (id is not null) { Version(r, version); r.Version++; } else db.AutomationRules.Add(r);
        r.Name = b.Name.Trim(); r.State = b.State; r.Priority = b.Priority; r.PreviewOnly = b.PreviewOnly; r.ConditionsJson = JsonSerializer.Serialize(c, Json); r.ActionsJson = JsonSerializer.Serialize(b.Actions, Json); r.UpdatedAt = DateTimeOffset.UtcNow; return AutomationDto(r);
    }
    public async Task<object> Automations(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var q = db.AutomationRules.AsNoTracking().Where(x => x.UserId == user); var total = await q.CountAsync(); var rows = await q.OrderBy(x => x.Priority).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).ToArrayAsync(); return new { items = rows.Select(AutomationDto), total, page, pageSize = size };
    }
    private static bool Matches(AutomationConditions c, SaveTransaction t, string currency, string source = "Recurring")
    {
        static bool Contains(string? value, string? keyword) => keyword is null || (value ?? "").Contains(keyword, StringComparison.OrdinalIgnoreCase);
        return (c.Source is null || c.Source == source) && (c.MerchantExact is null || string.Equals(t.Merchant, c.MerchantExact, StringComparison.OrdinalIgnoreCase)) && Contains(t.Merchant, c.MerchantKeyword) && Contains(t.Note, c.NoteKeyword)
            && (c.AccountId is null || t.AccountId == c.AccountId) && (c.Type is null || t.Type == c.Type) && (c.Currency is null || currency == c.Currency)
            && (c.MinimumAmount is null || Money(t.Amount) >= Money(c.MinimumAmount)) && (c.MaximumAmount is null || Money(t.Amount) <= Money(c.MaximumAmount))
            && (c.Start is null || t.OccurredAt >= c.Start) && (c.End is null || t.OccurredAt <= c.End);
    }
    private sealed record AutomationPreviewRow(string Id, string Version, SaveTransaction Before, SaveTransaction After, SaveTransaction Applicable, string[] HitRules, string[] Conflicts, string[] ProtectedFields, string[] ChangedFields, string[] AppliedRuleIds, string[] TemplateIds);
    private async Task<(AutomationPreviewRow[] Rows, string Token)> BuildAutomationPreview(string user, AutomationBatch b)
    {
        Require(b.OccurrenceIds.Length is > 0 and <= 100 && b.OccurrenceIds.Distinct().Count() == b.OccurrenceIds.Length, "请选择1至100笔不同的待确认实例");
        var occurrences = await db.RecurringOccurrences.Where(x => x.UserId == user && b.OccurrenceIds.Contains(x.Id)).OrderBy(x => x.Id).ToArrayAsync(); Require(occurrences.Length == b.OccurrenceIds.Length, "部分实例不存在");
        Require(occurrences.All(x => x.State is "Pending" or "Failed"), "只能整理未过账实例");
        var rules = await db.AutomationRules.Where(x => x.UserId == user && x.State == "Active").OrderBy(x => x.Priority).ThenBy(x => x.Id).Take(501).ToArrayAsync(); Require(rules.Length <= 500, "启用规则最多500条");
        var rows = new List<AutomationPreviewRow>();
        foreach (var o in occurrences)
        {
            var before = JsonSerializer.Deserialize<SaveTransaction>(o.PreparedPayloadJson ?? o.PayloadJson, Json)!; var after = before; var applicable = before;
            var hits = new List<string>(); var conflicts = new HashSet<string>(); var locked = new HashSet<string>(); var changes = new HashSet<string>(); var applied = new HashSet<string>(); var templates = new HashSet<string>(); var winners = new Dictionary<string, string>();
            foreach (var r in rules)
            {
                if (!Matches(JsonSerializer.Deserialize<AutomationConditions>(r.ConditionsJson, Json)!, before, o.Currency)) continue;
                hits.Add(r.Id); var a = JsonSerializer.Deserialize<AutomationActions>(r.ActionsJson, Json)!;
                await ValidateActions(user, a, before.Type);
                void Set(string field, string? value, string? original, Func<SaveTransaction, string, SaveTransaction> setter)
                {
                    if (string.IsNullOrWhiteSpace(value)) return;
                    if (!string.IsNullOrWhiteSpace(original)) { locked.Add(field); return; }
                    if (winners.TryGetValue(field, out var previous)) { if (previous != value) conflicts.Add(field); return; }
                    winners[field] = value; after = setter(after, value); changes.Add(field);
                    if (!r.PreviewOnly) { applicable = setter(applicable, value); applied.Add(r.Id); }
                }
                Set("categoryId", a.CategoryId, before.CategoryId, (t, v) => t with { CategoryId = v });
                Set("merchant", a.Merchant, before.Merchant, (t, v) => t with { Merchant = v });
                Set("projectId", a.ProjectId, before.ProjectId, (t, v) => t with { ProjectId = v });
                Set("note", a.Note, before.Note, (t, v) => t with { Note = v });
                var tags = (after.TagIds ?? []).Union(a.TagIds ?? []).Order().ToArray(); if (!tags.SequenceEqual(after.TagIds ?? [])) { after = after with { TagIds = tags }; changes.Add("tagIds"); }
                if (!r.PreviewOnly) { var allowed = (applicable.TagIds ?? []).Union(a.TagIds ?? []).Order().ToArray(); if (!allowed.SequenceEqual(applicable.TagIds ?? [])) { applicable = applicable with { TagIds = allowed }; applied.Add(r.Id); } }
                if (a.TemplateId is not null) templates.Add(a.TemplateId);
            }
            rows.Add(new(o.Id, o.Version.ToString(), before, after, applicable, hits.ToArray(), conflicts.Order().ToArray(), locked.Order().ToArray(), changes.Order().ToArray(), applied.Order().ToArray(), templates.Order().ToArray()));
        }
        var token = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { rows, rules = rules.Select(x => new { x.Id, x.Version }) }, Json)))); return (rows.ToArray(), token);
    }
    public async Task<object> PreviewAutomation(string user, AutomationBatch b) { var p = await BuildAutomationPreview(user, b); return new { items = p.Rows, previewToken = p.Token, policy = "优先级数字小者优先，同级按ID；只填空白字段，预览模式不写入" }; }
    public async Task<object> SuggestAutomation(string user, AutomationDraft b)
    {
        var t = b.Transaction; Require(t.Type is "Expense" or "Income" or "Transfer", "当前交易类型不支持规则建议"); Money(t.Amount, true); var account = await Account(user, t.AccountId);
        Require(t.Note.Length <= 2000 && (t.Merchant?.Length ?? 0) <= 200, "商户或备注过长");
        var rules = await db.AutomationRules.AsNoTracking().Where(x => x.UserId == user && x.State == "Active").OrderBy(x => x.Priority).ThenBy(x => x.Id).Take(501).ToArrayAsync(); Require(rules.Length <= 500, "启用规则最多500条");
        var after = t; var conflicts = new HashSet<string>(); var protectedFields = new HashSet<string>(); var winners = new Dictionary<string, string>(); var hitRules = new List<string>(); var templates = new HashSet<string>();
        foreach (var r in rules)
        {
            if (!Matches(JsonSerializer.Deserialize<AutomationConditions>(r.ConditionsJson, Json)!, t, account.Currency, "Manual")) continue;
            var a = JsonSerializer.Deserialize<AutomationActions>(r.ActionsJson, Json)!; await ValidateActions(user, a, t.Type); hitRules.Add(r.Id);
            void Set(string field, string? v, string? original, Func<SaveTransaction, string, SaveTransaction> setter)
            {
                if (string.IsNullOrWhiteSpace(v)) return; if (!string.IsNullOrWhiteSpace(original)) { protectedFields.Add(field); return; }
                if (winners.TryGetValue(field, out var previous)) { if (previous != v) conflicts.Add(field); return; } winners[field] = v; after = setter(after, v);
            }
            Set("categoryId", a.CategoryId, t.CategoryId, (x, v) => x with { CategoryId = v }); Set("merchant", a.Merchant, t.Merchant, (x, v) => x with { Merchant = v }); Set("projectId", a.ProjectId, t.ProjectId, (x, v) => x with { ProjectId = v }); Set("note", a.Note, t.Note, (x, v) => x with { Note = v }); after = after with { TagIds = (after.TagIds ?? []).Union(a.TagIds ?? []).Order().ToArray() }; if (a.TemplateId is not null) templates.Add(a.TemplateId);
        }
        var promotionSuggestions = t.Type == "Expense" ? (await db.Set<PromotionBenefit>().AsNoTracking().Where(x => x.UserId == user && x.State == "Active" && x.Currency == account.Currency && x.StartsAt <= DateTimeOffset.UtcNow && x.ExpiresAt >= DateTimeOffset.UtcNow && x.Quantity > 0 && (x.Mode != "Balance" || x.RemainingValue > 0) && (x.AccountId == null || x.AccountId == account.Id) && (x.Merchant == "" || x.Merchant == t.Merchant) && x.MinimumAmount <= Money(t.Amount)).OrderBy(x => x.ExpiresAt).Take(10).ToListAsync()).Select(BenefitDto).ToArray() : [];
        return new { before = t, after, hitRules, conflicts = conflicts.Order(), protectedFields = protectedFields.Order(), templateIds = templates.Order(), promotionSuggestions, posted = false };
    }
    public async Task<object> ApplyAutomation(string user, AutomationBatch b, string key)
    {
        var p = await BuildAutomationPreview(user, b); if (b.PreviewToken != p.Token) throw new ApiException(409, "预览已过期，请重新预览"); var changed = 0;
        foreach (var row in p.Rows)
        {
            var o = await db.RecurringOccurrences.SingleAsync(x => x.UserId == user && x.Id == row.Id);
            var payload = JsonSerializer.Serialize(row.Applicable, Json); if (payload != JsonSerializer.Serialize(row.Before, Json)) { o.PreparedPayloadJson = payload; o.Version++; o.UpdatedAt = DateTimeOffset.UtcNow; changed++; }
            foreach (var ruleId in row.HitRules)
            {
                var r = await db.AutomationRules.SingleAsync(x => x.UserId == user && x.Id == ruleId); var didApply = row.AppliedRuleIds.Contains(ruleId); if (didApply) { r.HitCount++; r.Version++; r.UpdatedAt = DateTimeOffset.UtcNow; }
                db.AutomationExecutions.Add(new() { UserId = user, RuleId = ruleId, OccurrenceId = o.Id, State = didApply ? "Applied" : "PreviewOrProtected", ChangedFieldsJson = JsonSerializer.Serialize(row.ChangedFields, Json), OperationKey = key });
            }
        }
        return new { changed, posted = 0 };
    }
    public async Task<object> AutomationHistory(string user, IQueryCollection query)
    {
        var (page, size) = Paging(query); var ruleId = query["ruleId"].ToString(); var q = db.AutomationExecutions.AsNoTracking().Where(x => x.UserId == user && (ruleId == "" || x.RuleId == ruleId)); return new { total = await q.CountAsync(), items = await q.OrderByDescending(x => x.CreatedAt).ThenBy(x => x.Id).Skip((page - 1) * size).Take(size).Select(x => new { x.Id, x.RuleId, x.OccurrenceId, x.State, x.ChangedFieldsJson, x.CreatedAt, x.OperationKey }).ToArrayAsync(), page, pageSize = size };
    }
}



