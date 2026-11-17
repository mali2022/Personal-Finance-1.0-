using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;
public sealed record MemoryInput(string Key, string? TransactionId, bool Favorite, string Note);
public sealed partial class FinanceService
{
    public async Task<object> MemoryBookmarks(string user) => await db.Set<FinancialMemory>().AsNoTracking().Where(x => x.UserId == user).OrderByDescending(x => x.UpdatedAt).Select(x => new { x.Id, x.Key, x.TransactionId, x.Favorite, x.Note, version = x.Version.ToString() }).ToArrayAsync();
    public async Task<object> SaveMemory(string user, MemoryInput input, string? version)
    {
        Require(input.Key != null && input.Note != null && input.Note.Length <= 2000, "记忆备注最多2000字");
        if (input.TransactionId != null) {
            Require(input.Key == "tx:" + input.TransactionId, "交易回忆标识无效");
            Require(await db.Transactions.AnyAsync(x => x.UserId == user && x.Id == input.TransactionId && x.Status == "Confirmed"), "交易不存在或无权访问");
        } else if (input.Key!.StartsWith("day:")) Require(input.Key.Length == 9 && DateOnly.TryParseExact("2000-" + input.Key[4..], "yyyy-MM-dd", out _), "月日回忆标识无效");
        else Require(System.Text.RegularExpressions.Regex.IsMatch(input.Key!, @"^date:\d{4}-\d{2}-\d{2}$") && DateOnly.TryParseExact(input.Key![5..], "yyyy-MM-dd", out _), "日期回忆标识无效");
        var row = await db.Set<FinancialMemory>().SingleOrDefaultAsync(x => x.UserId == user && x.Key == input.Key);
        if (row == null) { Require(version == "0", "记忆版本无效"); row = new() { UserId = user, Key = input.Key! }; db.Add(row); } else { Version(row, version); row.Version++; }
        row.TransactionId = input.TransactionId; row.Favorite = input.Favorite; row.Note = input.Note!; row.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(); return new { row.Id, row.Key, row.TransactionId, row.Favorite, row.Note, version = row.Version.ToString() };
    }
}

