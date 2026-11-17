namespace PersonalFinance.Api.Application;

public static class SmartReconciliationEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/smart-reconciliation/rules/preview",async(StatementRuleInput b,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementRulePreview(FinanceEndpoints.User(c),b)));
        api.MapGet("/smart-reconciliation/overview",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementOverview(FinanceEndpoints.User(c))));
        api.MapGet("/smart-reconciliation/transaction-links",async(string transactionId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementTransactionLinks(FinanceEndpoints.User(c),transactionId,c.Request.Query)));
        api.MapGet("/smart-reconciliation/source-trust",async(string accountId,string importJobId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementTrustInfo(FinanceEndpoints.User(c),accountId,importJobId)));
        api.MapPost("/smart-reconciliation/tasks/{id}/auto-preview",async(string id,StatementTaskRun b,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementAutomaticPreview(FinanceEndpoints.User(c),id,b)));
        api.MapGet("/smart-reconciliation/balance/history",async(string accountId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementBalanceHistory(FinanceEndpoints.User(c),accountId,c.Request.Query)));
        api.MapGet("/smart-reconciliation/history",async(string accountId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementAudit(FinanceEndpoints.User(c),accountId,c.Request.Query)));
        api.MapGet("/smart-reconciliation/issues", async (string accountId,DateTimeOffset startsAt,DateTimeOffset endsAt,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementIssues(FinanceEndpoints.User(c),accountId,startsAt,endsAt,c.Request.Query)));
        api.MapPost("/smart-reconciliation/allocations/preview", async (StatementAllocationInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c,await f.StatementAllocations(FinanceEndpoints.User(c),b,false)));
        api.MapPost("/smart-reconciliation/allocations/confirm", async (StatementAllocationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.StatementAllocations(FinanceEndpoints.User(c),b,true),true));
        api.MapGet("/smart-reconciliation/tasks", async (string accountId, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementTasks(FinanceEndpoints.User(c), accountId)));
        api.MapGet("/smart-reconciliation/tasks/{id}/steps", async (string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.StatementTaskHistory(FinanceEndpoints.User(c),id,c.Request.Query)));
        api.MapPost("/smart-reconciliation/tasks", async (StatementTaskInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.StatementTaskCreate(FinanceEndpoints.User(c),b),true));
        api.MapPost("/smart-reconciliation/tasks/{id}/step", async (string id, StatementTaskRun b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.StatementTaskStep(FinanceEndpoints.User(c),id,b),true));
        api.MapPost("/smart-reconciliation/batch/preview", async (StatementBatchInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c,await f.StatementBatch(FinanceEndpoints.User(c),b,false)));
        api.MapPost("/smart-reconciliation/batch/execute", async (StatementBatchInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.StatementBatch(FinanceEndpoints.User(c),b,true),true));
        api.MapGet("/smart-reconciliation", async (string accountId, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementWorkspace(FinanceEndpoints.User(c), accountId, c.Request.Query)));
        api.MapGet("/smart-reconciliation/rules", async (string accountId, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementRules(FinanceEndpoints.User(c), accountId)));
        api.MapPost("/smart-reconciliation/rules", async (StatementRuleInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveStatementRule(FinanceEndpoints.User(c), null, b), true));
        api.MapPost("/smart-reconciliation/rules/{id}", async (string id, StatementRuleInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveStatementRule(FinanceEndpoints.User(c), id, b), true));
        api.MapPost("/smart-reconciliation/balance/preview", async (StatementBalanceInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementBalance(FinanceEndpoints.User(c), b, false)));
        api.MapPost("/smart-reconciliation/balance/complete", async (StatementBalanceInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.StatementBalance(FinanceEndpoints.User(c), b, true), true));
        api.MapPost("/smart-reconciliation/import", async (StatementImportInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ImportStatements(FinanceEndpoints.User(c), b), true));
        api.MapGet("/smart-reconciliation/{id}/candidates", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementCandidates(FinanceEndpoints.User(c), id)));
        api.MapGet("/smart-reconciliation/{id}/history", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.StatementHistory(FinanceEndpoints.User(c), id,c.Request.Query)));
        api.MapPost("/smart-reconciliation/{id}/confirm", async (string id, StatementConfirmInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ConfirmStatement(FinanceEndpoints.User(c), id, b), true));
        api.MapPost("/smart-reconciliation/{id}/resolve", async (string id, StatementResolveInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ResolveStatement(FinanceEndpoints.User(c), id, b), true));
        api.MapPost("/smart-reconciliation/{id}/correct", async (string id, StatementCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.CorrectStatement(FinanceEndpoints.User(c),id,b),true));
    }
}
