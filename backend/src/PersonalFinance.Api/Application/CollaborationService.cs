using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Api.Application;

public sealed record ShareInput(string MemberId, string Value);
public sealed record CollaborationInput(string? BookId, string? ConsumerId = null, string? PayerId = null, string Rule = "Equal", ShareInput[]? Shares = null);
public sealed record CalculatedShare(string MemberId, decimal Amount);
public sealed record SpaceInput(string Name, string Kind = "Book", string Description = "", string? FamilyId = null, int SortOrder = 0, bool Archived = false, string? Version = null);
public sealed record MemberInput(string Name, string Role = "Viewer", string Profile = "", bool Active = true, string? Version = null);
public sealed record InviteInput(string Email, string Role = "Viewer");
public sealed record SharedBudgetInput(string Month, string Currency, string Amount, string? Version = null);
public sealed record SharedSettlementInput(string FromMemberId, string ToMemberId, string Currency, string Amount, string Note);

public sealed partial class FinanceService
{
    public async Task ProtectSharedTransaction(string user, string id)
    {
        var link = await db.Set<SharedTransaction>().SingleOrDefaultAsync(x => x.TransactionId == id && x.UserId == user);
        if (link == null) return;
        var book = await SpaceAccess(user, link.BookId, "Editor");
        if (book.FamilyId != null) await SpaceAccess(user, book.FamilyId, "Editor");
    }
    public async Task CompleteSharedTransaction(string user, FinanceTransaction transaction, CollaborationInput? input)
    {
        if (input != null) { await ApplyCollaboration(user, transaction.Id, input); return; }
        var link = await db.Set<SharedTransaction>().SingleOrDefaultAsync(x => x.TransactionId == transaction.Id && x.UserId == user);
        if (link == null) return;
        var shares = JsonSerializer.Deserialize<CalculatedShare[]>(link.SharesJson, Json) ?? [];
        Require(shares.Length == 0 || transaction.Type == "Expense" && shares.Sum(s => s.Amount) == transaction.Amount, "请在交易编辑中同步调整共同消费分摊");
    }
    public static CalculatedShare[] CalculateShares(decimal amount, int places, string rule, ShareInput[] shares)
    {
        Require(places is >= 0 and <= 4 && amount > 0, "分摊金额或精度无效");
        Require(shares.Length is > 0 and <= 100 && shares.Select(x => x.MemberId).Distinct().Count() == shares.Length, "费用承担人不能为空或重复");
        Require(rule is "Equal" or "Percent" or "Amount", "分摊规则无效");
        var factor = (decimal)Math.Pow(10, places);
        Require(amount * factor == decimal.Truncate(amount * factor), "分摊金额超出币种精度");
        var weights = shares.Select(x => rule == "Equal" ? 1m : Money(x.Value)).ToArray();
        Require(weights.All(x => x > 0), "分摊值必须大于零");
        var sum = weights.Sum();
        Require(rule != "Percent" || sum == 100, "分摊比例合计必须为100%");
        Require(rule != "Amount" || sum == amount, "分摊金额合计必须等于交易金额");
        if (rule == "Amount") {
            Require(weights.All(x => x * factor == decimal.Truncate(x * factor)), "分摊金额超出币种精度");
            return shares.Select((s, i) => new CalculatedShare(s.MemberId, weights[i])).ToArray();
        }
        var units = amount * factor;
        var raw = weights.Select(w => units * w / sum).ToArray();
        var rounded = raw.Select(decimal.Floor).ToArray();
        var left = (int)(units - rounded.Sum());
        foreach (var i in Enumerable.Range(0, shares.Length).OrderByDescending(i => raw[i] - rounded[i]).ThenBy(i => shares[i].MemberId).Take(left)) rounded[i]++;
        return shares.Select((s, i) => new CalculatedShare(s.MemberId, rounded[i] / factor)).ToArray();
    }
    public async Task<FinanceSpace> SpaceAccess(string user, string id, string level = "Viewer")
    {
        var space = await db.Set<FinanceSpace>().SingleOrDefaultAsync(x => x.Id == id) ?? throw new ApiException(404, "账本或家庭不存在");
        var role = space.UserId == user ? "Owner" : await db.Set<SpaceMember>().Where(x => x.SpaceId == id && x.LinkedUserId == user && x.Active).Select(x => x.Role).SingleOrDefaultAsync();
        Require(role != null && (level == "Viewer" || role == "Owner" || level == "Editor" && role == "Editor"), "没有相应的账本或家庭权限");
        Require(level == "Viewer" || !space.Archived, "已归档账本不可写入");
        return space;
    }
    public async Task<object> SpaceList(string user)
    {
        var memberships = db.Set<SpaceMember>().Where(m => m.LinkedUserId == user && m.Active).Select(m => m.SpaceId);
        var spaces = await db.Set<FinanceSpace>().Where(s => s.UserId == user || memberships.Contains(s.Id)).OrderBy(s => s.SortOrder).ThenBy(s => s.Name).ToArrayAsync();
        var members = await db.Set<SpaceMember>().Where(m => m.LinkedUserId == user && m.Active).ToArrayAsync();
        return spaces.Select(s => new { s.Id, s.Name, s.Kind, s.Description, s.SortOrder, s.Archived, s.FamilyId, role = s.UserId == user ? "Owner" : members.Single(m => m.SpaceId == s.Id).Role, version = s.Version.ToString() });
    }
    public async Task<object> SaveSpace(string user, SpaceInput b, string? id)
    {
        Require(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 100 && b.Description.Length <= 1000 && b.Kind is "Book" or "Family", "名称、类型或说明无效");
        FinanceSpace space;
        if (id == null) {
            space = new() { UserId = user, Kind = b.Kind }; db.Add(space);
            db.Add(new SpaceMember { UserId = user, SpaceId = space.Id, LinkedUserId = user, Name = (await db.Users.SingleAsync(u => u.Id == user)).DisplayName, Role = "Owner" });
        } else {
            space = await SpaceAccess(user, id); Require(space.UserId == user, "只有所有者可修改设置"); Version(space, b.Version);
            Require(space.Kind == b.Kind && space.FamilyId == b.FamilyId, "账本创建后不能改变类型或所属家庭"); space.Version++;
        }
        if (id == null && b.FamilyId != null) {
            var family = await SpaceAccess(user, b.FamilyId, "Owner"); Require(b.Kind == "Book" && family.Kind == "Family", "家庭归属无效"); space.FamilyId = family.Id;
        }
        space.Name = b.Name.Trim(); space.Description = b.Description.Trim(); space.SortOrder = b.SortOrder; space.Archived = b.Archived;
        return new { space.Id };
    }
    public async Task<object> SaveSpaceMember(string user, string id, string? memberId, MemberInput b)
    {
        await SpaceAccess(user, id, "Owner");
        Require(!string.IsNullOrWhiteSpace(b.Name) && b.Name.Length <= 100 && b.Profile.Length <= 1000 && b.Role is "Viewer" or "Editor", "成员资料或权限无效");
        var m = memberId == null ? new SpaceMember { UserId = user, SpaceId = id } : await db.Set<SpaceMember>().SingleOrDefaultAsync(x => x.SpaceId == id && x.Id == memberId) ?? throw new ApiException(404, "成员不存在");
        Require(m.Role != "Owner", "不可修改所有者权限");
        if (memberId == null) db.Add(m); else { Version(m, b.Version); m.Version++; }
        m.Name = b.Name.Trim(); m.Profile = b.Profile.Trim(); m.Role = b.Role; m.Active = b.Active;
        return new { m.Id };
    }
    public async Task<object> InviteSpace(string user, string id, InviteInput b)
    {
        await SpaceAccess(user, id, "Owner");
        Require(b.Role is "Viewer" or "Editor" && b.Email.Length <= 256 && System.Net.Mail.MailAddress.TryCreate(b.Email, out var _), "邀请邮箱或权限无效");
        var email = b.Email.Trim().ToLowerInvariant();
        Require(!await db.Set<SpaceInvitation>().AnyAsync(x => x.SpaceId == id && x.Email == email && x.State == "Pending" && x.ExpiresAt > DateTimeOffset.UtcNow), "已有待接受邀请");
        var invitation = new SpaceInvitation { UserId = user, SpaceId = id, Email = email, Role = b.Role }; db.Add(invitation); return new { invitation.Id };
    }
    public async Task<object> AcceptSpace(string user, string id)
    {
        var email = (await db.Users.SingleAsync(x => x.Id == user)).Email.ToLower();
        var invitation = await db.Set<SpaceInvitation>().SingleOrDefaultAsync(x => x.Id == id && x.Email == email) ?? throw new ApiException(404, "邀请不存在");
        Require(invitation.State == "Pending" && invitation.ExpiresAt > DateTimeOffset.UtcNow, "邀请已失效");
        var space = await db.Set<FinanceSpace>().SingleAsync(x => x.Id == invitation.SpaceId); Require(!space.Archived, "账本已归档");
        var member = await db.Set<SpaceMember>().SingleOrDefaultAsync(x => x.SpaceId == space.Id && x.LinkedUserId == user);
        if (member == null) { member = new() { UserId = space.UserId, SpaceId = space.Id, LinkedUserId = user, Name = (await db.Users.SingleAsync(x => x.Id == user)).DisplayName }; db.Add(member); }
        Require(member.Role != "Owner", "所有者无需接受邀请");
        member.Active = true; member.Role = invitation.Role; member.Version++; invitation.State = "Accepted"; invitation.Version++;
        return new { space.Id };
    }
    public async Task ApplyCollaboration(string user, string transactionId, CollaborationInput b)
    {
        var old = await db.Set<SharedTransaction>().SingleOrDefaultAsync(x => x.TransactionId == transactionId && x.UserId == user);
        if (old != null) {
            await SpaceAccess(user, old.BookId, "Editor");
            var oldBook = await db.Set<FinanceSpace>().SingleAsync(s => s.Id == old.BookId);
            if (oldBook.FamilyId != null) await SpaceAccess(user, oldBook.FamilyId, "Editor");
        }
        if (string.IsNullOrEmpty(b.BookId)) { if (old != null) db.Remove(old); return; }
        var book = await SpaceAccess(user, b.BookId, "Editor"); Require(book.Kind == "Book", "请选择账本");
        var scope = book.FamilyId ?? book.Id;
        if (book.FamilyId != null) await SpaceAccess(user, scope, "Editor");
        var transaction = db.Transactions.Local.SingleOrDefault(t => t.Id == transactionId && t.UserId == user) ?? await Transaction(user, transactionId);
        if (transaction.Type == "Refund" && transaction.OriginalTransactionId != null) {
            var source = await db.Set<SharedTransaction>().SingleOrDefaultAsync(x => x.TransactionId == transaction.OriginalTransactionId);
            Require(source != null && source.BookId == book.Id, "退款须随原交易账本统计，请先设置原交易归属");
            if (old != null) db.Remove(old);
            return;
        }
        var members = await db.Set<SpaceMember>().Where(m => m.SpaceId == scope && m.Active).Select(m => m.Id).ToArrayAsync();
        Require(b.ConsumerId == null || members.Contains(b.ConsumerId), "消费人不属于当前家庭或账本");
        Require(b.PayerId == null || members.Contains(b.PayerId), "付款人不属于当前家庭或账本");
        var shares = b.Shares ?? [];
        Require(shares.All(s => members.Contains(s.MemberId)), "费用承担人不属于当前家庭或账本");
        Require(shares.Length == 0 || transaction.Type == "Expense", "只有支出交易支持费用分摊");
        Require(shares.Length == 0 || b.PayerId != null, "分摊必须选择付款人");
        var expense = transaction.Entries.Where(e => e.Kind == "Expense").Sum(e => e.Amount);
        var precision = 2;
        var calculated = shares.Length == 0 ? [] : CalculateShares(expense, precision, b.Rule, shares);
        if (old == null) { old = new() { UserId = user, TransactionId = transactionId }; db.Add(old); } else old.Version++;
        old.BookId = book.Id; old.ConsumerId = b.ConsumerId; old.PayerId = b.PayerId; old.Rule = b.Rule; old.SharesJson = JsonSerializer.Serialize(calculated, Json); old.InputsJson = JsonSerializer.Serialize(shares, Json);
    }
}
