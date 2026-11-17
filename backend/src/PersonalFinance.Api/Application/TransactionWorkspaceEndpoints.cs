using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;

namespace PersonalFinance.Api.Application;

public static class TransactionWorkspaceEndpoints
{
    public sealed record StatementInput(string AccountId, string StatementReference, string Amount, string Note, string Version);
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/transactions/daily-summary", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.TransactionDailySummary(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/transactions/summary", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.TransactionSummary(FinanceEndpoints.User(c), c.Request.Query, c.RequestAborted)));
        api.MapGet("/transactions/{id}/issues", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.TransactionIssues(FinanceEndpoints.User(c), id)));
        api.MapGet("/transactions/{id}/statement-matches", async (string id, FinanceService f, FinanceDb db, HttpContext c) => {
            var user = FinanceEndpoints.User(c); await f.Transaction(user, id);
            return FinanceEndpoints.Ok(c, await db.Set<TransactionStatementMatch>().AsNoTracking().Where(m => m.UserId == user && m.TransactionId == id).OrderByDescending(m => m.CreatedAt).Select(m => new { m.Id, m.AccountId, m.StatementReference, amount = FinanceService.M(m.StatementAmount), ledgerAmount = FinanceService.M(m.LedgerAmount), difference = FinanceService.M(m.StatementAmount - m.LedgerAmount), m.Currency, m.State, m.Note, m.CreatedAt, version = m.Version.ToString() }).ToArrayAsync());
        });
        api.MapPost("/transactions/{id}/statement-matches", async (string id, StatementInput b, FinanceService f, FinanceDb db, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => {
            var user = FinanceEndpoints.User(c); var t = await f.Transaction(user, id); FinanceService.Version(t, b.Version);
            FinanceService.Require(t.Status != "Deleted", "已删除交易不可核对");
            var account = await f.Account(user, b.AccountId, false);
            FinanceService.Require(!string.IsNullOrWhiteSpace(b.StatementReference) && b.StatementReference.Length <= 200 && !string.IsNullOrWhiteSpace(b.Note) && b.Note.Length <= 2000, "请填写账单唯一标识和核对说明");
            FinanceService.Require(t.Entries.Any(e => e.Kind == "Account" && e.AccountId == b.AccountId), "交易没有该账户的资金分录");
            FinanceService.Require(!await db.Set<StatementLink>().AnyAsync(m => m.UserId == user && m.AccountId == b.AccountId && m.State == "Confirmed"&&(m.TransactionId==id||db.Set<StatementRecord>().Any(r=>r.UserId==user&&r.Id==m.StatementRecordId&&r.Reference==b.StatementReference.Trim()))), "交易或来源参考号已有智能对账匹配，请先撤销");
            FinanceService.Require(!await db.Set<TransactionStatementMatch>().AnyAsync(m => m.UserId == user && m.AccountId == b.AccountId && m.StatementReference == b.StatementReference.Trim() && m.State == "Matched"), "该账单记录已经匹配，请先撤销原匹配");
            var amount = FinanceService.Money(b.Amount); var ledger = t.Entries.Where(e => e.Kind == "Account" && e.AccountId == b.AccountId).Sum(e => e.Amount);
            var match = new TransactionStatementMatch { UserId = user, TransactionId = id, AccountId = account.Id, Currency = account.Currency, StatementReference = b.StatementReference.Trim(), StatementAmount = amount, LedgerAmount = ledger, Note = b.Note.Trim(), State = amount == ledger ? "Matched" : "Difference" };
            db.Add(match); t.Version++; t.UpdatedAt = DateTimeOffset.UtcNow;
            return new { match.Id, match.State, difference = FinanceService.M(amount - ledger) };
        }, true));
        api.MapPost("/transactions/{id}/statement-matches/{matchId}/revoke", async (string id, string matchId, FinanceService f, FinanceDb db, HttpContext c) => await FinanceEndpoints.Write(c, f, new { id, matchId }, async () => {
            var user = FinanceEndpoints.User(c); var t = await f.Transaction(user, id);
            var match = await db.Set<TransactionStatementMatch>().SingleOrDefaultAsync(m => m.UserId == user && m.TransactionId == id && m.Id == matchId) ?? throw new PersonalFinance.Api.Contracts.ApiException(404, "匹配记录不存在");
            FinanceService.Version(match, c.Request.Headers.IfMatch); FinanceService.Require(match.State != "Revoked", "匹配已撤销");
            match.State = "Revoked"; match.Version++; t.Version++; t.UpdatedAt = DateTimeOffset.UtcNow;
            return new { match.Id, match.State };
        }, true));
    }
}
