namespace PersonalFinance.Api.Application;
public static class DebtPlanningEndpoints
{
    public static void Map(RouteGroupBuilder api) {
        api.MapGet("/reports/debt-pressure", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPressure(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/debt-plans/order-preview", async (DebtOrderInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtOrderPreview(FinanceEndpoints.User(c), b)));
        api.MapGet("/debt-plans/{id}/allocations", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtAllocationDetails(FinanceEndpoints.User(c), id)));
        api.MapPost("/debt-plans/{id}/allocations", async (string id, DebtAllocationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.AllocateDebtPayment(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/debt-plans/{id}/allocations/{allocationId}/revoke", async (string id, string allocationId, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, new { allocationId }, async () => await f.RevokeDebtAllocation(FinanceEndpoints.User(c), id, allocationId, c.Request.Headers.IfMatch), true));
        api.MapGet("/debt-plans", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPlans(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/credit-installments", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPlans(FinanceEndpoints.User(c), c.Request.Query, "CreditInstallment")));
        api.MapPost("/debt-plans", async (DebtPlanInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveDebtPlan(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/debt-plans/{id}", async (string id, DebtPlanInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveDebtPlan(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/debt-plans/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPlanDetail(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapGet("/debt-plans/{id}/history", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPlanHistory(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapPost("/debt-plans/{id}/payoff-preview", async (string id, PayoffInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.DebtPayoffPreview(FinanceEndpoints.User(c), id, b)));
    }
}
