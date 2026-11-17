using PersonalFinance.Api.Contracts;
using static PersonalFinance.Api.Application.FinanceEndpoints;
namespace PersonalFinance.Api.Application;
public static class RecurringEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/planning/capabilities", (HttpContext c) => Ok(c, new { recurring = true, subscriptions = true, calendar = true, automation = true }));
        api.MapGet("/recurring-rules", async (FinanceService f, HttpContext c) => Ok(c, await f.RecurringList(User(c), c.Request.Query)));
        api.MapGet("/recurring-rules/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.RecurringDetail(User(c), id)));
        api.MapPost("/recurring-rules", async (RecurringInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveRecurring(User(c), b, null, null), true));
        api.MapPut("/recurring-rules/{id}", async (string id, RecurringInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveRecurring(User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapPost("/recurring-rules/{id}/actions", async (string id, RecurringAction b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.RuleAction(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/recurring-rules/{id}/history", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.RecurringHistory(User(c), id, c.Request.Query)));
        api.MapPost("/recurring-occurrences/generate", async (FinanceService f, HttpContext c) => await Write(c, f, new { }, async () => await f.GenerateOccurrences(User(c), DateTimeOffset.UtcNow, "User")));
        api.MapGet("/recurring-occurrences", async (FinanceService f, HttpContext c) => Ok(c, await f.Occurrences(User(c), c.Request.Query)));
        api.MapPost("/recurring-occurrences/{id}/actions", async (string id, RecurringAction b, FinanceService f, HttpContext c) =>
        {
            try { return await Write(c, f, b, async () => await f.OccurrenceAction(User(c), id, b, c.Request.Headers.IfMatch, c.Request.Headers["Idempotency-Key"].ToString()), true); }
            catch (ApiException e) when (b.Action == "Confirm" && e.Status == 422) { await f.RecordOccurrenceFailure(User(c), id, c.Request.Headers["Idempotency-Key"].ToString(), c, e.Message); throw; }
        });
    }
}
