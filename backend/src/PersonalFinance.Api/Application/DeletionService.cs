using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public sealed record DirectoryDeletionRow(string Id, string Version, string Name, bool Allowed, string? Reason);

    private async Task<HashSet<string>> ReferencedDirectoryIds(string user, string kind)
    {
        var used = new HashSet<string>(StringComparer.Ordinal);
        if (kind == "merchants") {used.UnionWith(await db.Set<MerchantAlias>().Where(x=>x.UserId==user).Select(x=>x.MerchantId).ToArrayAsync());return used;}
        if (kind == "projects")
            used.UnionWith(await db.Transactions.Where(t => t.UserId == user && t.ProjectId != null).Select(t => t.ProjectId!).Distinct().ToListAsync());
        else
            used.UnionWith(await (from tag in db.Set<TransactionTag>() join t in db.Transactions on tag.TransactionId equals t.Id
                                  where t.UserId == user select tag.DirectoryId).Distinct().ToListAsync());
        // Read references once for the whole selection, including deleted transactions and historical payloads.
        var payloads = await db.AutomationRules.Where(x => x.UserId == user).Select(x => x.ActionsJson).ToListAsync();
        payloads.AddRange(await db.RecurringRules.Where(x => x.UserId == user).Select(x => x.PayloadJson).ToListAsync());
        payloads.AddRange(await db.RecurringOccurrences.Where(x => x.UserId == user).Select(x => x.PayloadJson).ToListAsync());
        payloads.AddRange(await db.RecurringOccurrences.Where(x => x.UserId == user && x.PreparedPayloadJson != null).Select(x => x.PreparedPayloadJson!).ToListAsync());
        payloads.AddRange(await db.ImportRows.Where(x => x.UserId == user).Select(x => x.DataJson).ToListAsync());
        foreach (var payload in payloads)
        {
            using var json = JsonDocument.Parse(payload);
            Collect(json.RootElement);
        }
        return used;
        void Collect(JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.String) used.Add(element.GetString()!);
            else if (element.ValueKind == JsonValueKind.Array) foreach (var child in element.EnumerateArray()) Collect(child);
            else if (element.ValueKind == JsonValueKind.Object) foreach (var property in element.EnumerateObject()) Collect(property.Value);
        }
    }

    private async Task<(List<DirectoryItem> Records, DirectoryDeletionRow[] Rows)> BuildDirectoryDeletion(string user, string kind, DirectoryDeletion input)
    {
        Require(kind is "merchants" or "tags" or "projects", "只支持删除商户、标签或项目");
        Require(input.Items != null && (input.All ? input.Items.Length == 0 : input.Items.Length is > 0 and <= 20000), "请选择记录；每次最多20000条");
        var items = input.Items!;
        Require(items.All(x => x != null && !string.IsNullOrWhiteSpace(x.Id) && !string.IsNullOrWhiteSpace(x.Version)) && items.Select(x => x.Id).Distinct().Count() == items.Length, "删除列表无效或包含重复记录");
        var query = db.Directory.Where(x => x.UserId == user && x.Kind == kind);
        if (!input.All) { var ids = items.Select(x => x.Id).ToArray(); query = query.Where(x => ids.Contains(x.Id)); }
        var records = await query.OrderBy(x => x.Name).ThenBy(x => x.Id).ToListAsync();
        Require(records.Count <= 20000, "记录超过20000条，请分批选择删除");
        if (!input.All)
        {
            if (records.Count != items.Length) throw new ApiException(404, "部分记录不存在或不可访问，请刷新后重新选择");
            var versions = items.ToDictionary(x => x.Id, x => x.Version);
            foreach (var record in records) Version(record, versions[record.Id]);
        }
        var used = await ReferencedDirectoryIds(user, kind);
        var rows = records.Select(x => new DirectoryDeletionRow(x.Id, x.Version.ToString(), x.Name, !used.Contains(x.Id),
            used.Contains(x.Id) ? "仍被交易、规则或历史记录引用，请先移除引用或改为停用" : null)).ToArray();
        return (records, rows);
    }

    public async Task<object> DirectoryDeletionPreview(string user, string kind, DirectoryDeletion input)
    {
        var (_, rows) = await BuildDirectoryDeletion(user, kind, input);
        return new { total = rows.Length, allowed = rows.Count(x => x.Allowed), blocked = rows.Count(x => !x.Allowed), items = rows };
    }

    public async Task<object> DeleteDirectories(string user, string kind, DirectoryDeletion input)
    {
        // Apply the exact preview snapshot, never expand to records created after confirmation.
        Require(!input.All, "请先预览，再提交确认的记录列表");
        var (records, rows) = await BuildDirectoryDeletion(user, kind, input);
        var eligible = rows.Where(x => x.Allowed).Select(x => x.Id).ToHashSet();
        db.Directory.RemoveRange(records.Where(x => eligible.Contains(x.Id)));
        if(kind=="merchants")InvalidateMerchantCache(user);
        return new { deleted = eligible.Count, skipped = rows.Where(x => !x.Allowed).ToArray() };
    }

    public async Task<object> DeleteTransactions(string user, TransactionDeletion input)
    {
        Require(input.Items != null && input.Items.Length is > 0 and <= 100, "每批请选择1至100笔交易");
        var items = input.Items!;
        Require(items.All(x => x != null && !string.IsNullOrWhiteSpace(x.Id) && !string.IsNullOrWhiteSpace(x.Version)) && items.Select(x => x.Id).Distinct().Count() == items.Length, "删除列表无效或包含重复交易");
        // The surrounding Write transaction rolls back the entire batch if any existing protection fails.
        foreach (var item in items) await ChangeTransaction(user, item.Id, false, item.Version);
        return new { deleted = items.Length };
    }
}
