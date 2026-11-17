using PersonalFinance.Api.Contracts;
using static PersonalFinance.Api.Application.FinanceEndpoints;
namespace PersonalFinance.Api.Application;
public static class AutomationEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/subscriptions", async (FinanceService f, HttpContext c) => Ok(c, await f.Subscriptions(User(c), c.Request.Query)));
        api.MapPost("/subscriptions", async (SubscriptionInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSubscription(User(c), b, null, null), true));
        api.MapPut("/subscriptions/{id}", async (string id, SubscriptionInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveSubscription(User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapGet("/automation-rules", async (FinanceService f, HttpContext c) => Ok(c, await f.Automations(User(c), c.Request.Query)));
        api.MapPost("/automation-rules", async (AutomationInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveAutomation(User(c), b, null, null), true));
        api.MapPut("/automation-rules/{id}", async (string id, AutomationInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveAutomation(User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapPost("/automation-rules/preview", async (AutomationBatch b, FinanceService f, HttpContext c) => Ok(c, await f.PreviewAutomation(User(c), b)));
        api.MapPost("/automation-rules/suggest", async (AutomationDraft b, FinanceService f, HttpContext c) => Ok(c, await f.SuggestAutomation(User(c), b)));
        api.MapPost("/automation-rules/apply", async (AutomationBatch b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ApplyAutomation(User(c), b, c.Request.Headers["Idempotency-Key"].ToString()), true));
        api.MapGet("/automation-executions", async (FinanceService f, HttpContext c) => Ok(c, await f.AutomationHistory(User(c), c.Request.Query)));
        api.MapGet("/calendar-events", async (FinanceService f, HttpContext c) => Ok(c, await f.CalendarEvents(User(c), c.Request.Query)));
        api.MapGet("/planning/summary", async (FinanceService f, HttpContext c) => Ok(c, await f.PlanningSummary(User(c))));
    }
}
