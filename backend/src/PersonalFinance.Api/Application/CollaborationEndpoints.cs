using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public static class CollaborationEndpoints
{
    private static Task<IResult> Write(HttpContext c, FinanceService f, object body, Func<Task<object?>> action) => FinanceEndpoints.Write(c, f, body, action, true);
    public static void Map(RouteGroupBuilder api)
    {
        CollaborationAiEndpoint.Map(api);
        api.MapGet("/book-comparison", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CompareBooks(FinanceEndpoints.User(c), c.Request.Query["ids"].ToString().Split(',', StringSplitOptions.RemoveEmptyEntries), c.Request.Query["month"].ToString())));
        api.MapGet("/spaces", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SpaceList(FinanceEndpoints.User(c))));
        api.MapPost("/spaces", async (SpaceInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSpace(FinanceEndpoints.User(c), b, null)));
        api.MapPut("/spaces/{id}", async (string id, SpaceInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSpace(FinanceEndpoints.User(c), b, id)));
        api.MapGet("/spaces/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SpaceReport(FinanceEndpoints.User(c), id, c.Request.Query["month"].FirstOrDefault() ?? DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"))));
        api.MapPost("/spaces/{id}/members", async (string id, MemberInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSpaceMember(FinanceEndpoints.User(c), id, null, b)));
        api.MapPut("/spaces/{id}/members/{memberId}", async (string id, string memberId, MemberInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSpaceMember(FinanceEndpoints.User(c), id, memberId, b)));
        api.MapPost("/spaces/{id}/invitations", async (string id, InviteInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.InviteSpace(FinanceEndpoints.User(c), id, b)));
        api.MapPost("/space-invitations/{id}/accept", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.AcceptSpace(FinanceEndpoints.User(c), id)));
        api.MapGet("/space-invitations", async (FinanceDb db, HttpContext c) => {
            var user = FinanceEndpoints.User(c); var email = (await db.Users.SingleAsync(u => u.Id == user)).Email.ToLower();
            return FinanceEndpoints.Ok(c, await (from i in db.Set<SpaceInvitation>() join s in db.Set<FinanceSpace>() on i.SpaceId equals s.Id where i.Email == email && i.State == "Pending" && i.ExpiresAt > DateTimeOffset.UtcNow && !s.Archived select new { i.Id, name = s.Name, i.Role, i.ExpiresAt }).ToArrayAsync());
        });
        api.MapPost("/spaces/{id}/invitations/{inviteId}/revoke", async (string id, string inviteId, FinanceService f, FinanceDb db, HttpContext c) => await Write(c, f, new { id, inviteId }, async () => {
            await f.SpaceAccess(FinanceEndpoints.User(c), id, "Owner"); var invite = await db.Set<SpaceInvitation>().SingleOrDefaultAsync(i => i.SpaceId == id && i.Id == inviteId) ?? throw new ApiException(404, "邀请不存在"); FinanceService.Version(invite, c.Request.Headers.IfMatch); FinanceService.Require(invite.State == "Pending", "邀请已经处理"); invite.State = "Revoked"; invite.Version++; return new { invite.Id };
        }));
        api.MapPut("/spaces/{id}/budget", async (string id, SharedBudgetInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSpaceBudget(FinanceEndpoints.User(c), id, b)));
        api.MapPost("/spaces/{id}/settlements", async (string id, SharedSettlementInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SettleSpace(FinanceEndpoints.User(c), id, b)));
        api.MapPost("/spaces/{id}/settlements/{settlementId}/revoke", async (string id, string settlementId, FinanceService f, FinanceDb db, HttpContext c) => await Write(c, f, new { id, settlementId }, async () => {
            await f.SpaceAccess(FinanceEndpoints.User(c), id, "Owner"); var s = await db.Set<SpaceSettlement>().SingleOrDefaultAsync(s => s.SpaceId == id && s.Id == settlementId) ?? throw new ApiException(404, "结算不存在"); FinanceService.Version(s, c.Request.Headers.IfMatch); FinanceService.Require(!s.Revoked, "结算已撤销"); s.Revoked = true; s.Version++; return new { s.Id };
        }));
        api.MapGet("/transactions/{id}/collaboration", async (string id, FinanceService f, FinanceDb db, HttpContext c) => {
            var user = FinanceEndpoints.User(c); await f.Transaction(user, id);
            var link = await db.Set<SharedTransaction>().SingleOrDefaultAsync(x => x.UserId == user && x.TransactionId == id);
            return FinanceEndpoints.Ok(c, link == null ? null : new { link.BookId, link.ConsumerId, link.PayerId, link.Rule, shares = System.Text.Json.JsonSerializer.Deserialize<ShareInput[]>(link.InputsJson, FinanceService.Json) });
        });
    }
}
