using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public static class FinancialPlanningEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        DebtPlanningEndpoints.Map(api);
        LoanScheduleEndpoints.Map(api);
        ConcertEndpoints.Map(api);
        api.MapPut("/cashflow/scenarios/{id}/changes", async (string id, ScenarioChangesInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveScenarioChanges(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/cashflow/scenarios/{id}/calculate", async (string id, ScenarioCalculateInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveScenarioCalculation(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/cashflow/scenarios/{id}/calculations", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ScenarioCalculations(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapGet("/cashflow/scenario-comparison", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ScenarioComparison(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/reports/metric-definitions", (HttpContext c) => FinanceEndpoints.Ok(c, FinanceService.MetricDefinitions()));
        api.MapGet("/reports/metric-details", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.MetricDetails(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/analysis-attributes", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AnalysisAttributes(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPut("/analysis-attributes", async (AnalysisAttributeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveAnalysisAttribute(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/reports/expense-structure", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ExpenseStructure(FinanceEndpoints.User(c), c.Request.Query, false)));
        api.MapGet("/reports/income-stability", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ExpenseStructure(FinanceEndpoints.User(c), c.Request.Query, true)));
        api.MapGet("/reports/net-worth-attribution", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.NetWorthAnalysis(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/reports/comparison", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FinancialReview(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/reports/monthly-review", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PeriodReview(FinanceEndpoints.User(c), c.Request.Query, false)));
        api.MapGet("/reports/annual-review", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PeriodReview(FinanceEndpoints.User(c), c.Request.Query, true)));
        api.MapGet("/budget-planning-history/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PlanningBudgetHistory(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapGet("/financial-planning/summary", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FinancialSummary(FinanceEndpoints.User(c))));
        api.MapGet("/cashflow/scenarios", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CashFlowScenarios(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/cashflow/scenarios", async (ScenarioInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveScenario(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/cashflow/scenarios/{id}", async (string id, ScenarioInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveScenario(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/budgets/copy-preview", async (BudgetCopyInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.BudgetCopy(FinanceEndpoints.User(c), b, false, null)));
        api.MapPost("/budgets/copy-apply", async (BudgetCopyInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.BudgetCopy(FinanceEndpoints.User(c), b, true, c.Request.Headers.IfMatch), true));
        api.MapGet("/essential-expense-policies", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.EssentialPolicies(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPut("/essential-expense-policies", async (EssentialPolicyInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveEssentialPolicy(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/reports/emergency-fund", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.EmergencyFund(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/reports/savings-rate", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SavingsRate(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/cashflow/forecast", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CashFlowForecast(FinanceEndpoints.User(c), c.Request.Query, c.RequestAborted)));
        api.MapGet("/cashflow/events", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FutureEvents(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/cashflow/events", async (FutureCashFlowInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveFutureEvent(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/cashflow/events/{id}", async (string id, FutureCashFlowInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveFutureEvent(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapDelete("/cashflow/events/{id}", async (string id, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, new { id }, async () => await f.CancelFutureEvent(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true));
        api.MapPost("/cashflow/events/{id}/actions", async (string id, PlanningAction b, FinanceService f, HttpContext c) => { FinanceService.Require(b.Action == "Cancel", "未来计划操作无效"); return await FinanceEndpoints.Write(c, f, b, async () => await f.CancelFutureEvent(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true); });
        api.MapGet("/savings-goals", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.Goals(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/savings-goals", async (GoalInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveGoal(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/savings-goals/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.GoalDetail(FinanceEndpoints.User(c), id, c.Request.Query)));
        api.MapPut("/savings-goals/{id}", async (string id, GoalInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveGoal(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/savings-goals/{id}/allocation-preview", async (string id, GoalAllocationInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.GoalAllocationPreview(FinanceEndpoints.User(c), id, b)));
        api.MapPost("/savings-goals/{id}/allocate", async (string id, GoalAllocationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ChangeGoalAllocation(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapPost("/savings-goals/{id}/release", async (string id, GoalAllocationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ChangeGoalAllocation(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true), true));
        api.MapPost("/savings-goals/{id}/transfer", async (string id, GoalTransferInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.TransferGoalAllocation(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/budgets/carryover-preview", async (CarryoverInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CarryPreview(FinanceEndpoints.User(c), b)));
        api.MapPost("/budgets/carryover-apply", async (CarryoverInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CarryApply(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapPost("/budgets/carryovers/{id}/correct", async (string id, CarryoverInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CorrectCarry(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/budgets/carryovers", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CarryHistory(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/budgets/carryovers/{id}/actions", async (string id, PlanningAction b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CancelCarry(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/budget-templates", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.BudgetTemplates(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/budget-templates", async (BudgetTemplateInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveBudgetTemplate(FinanceEndpoints.User(c), null, b, c.Request.Headers.IfMatch), true));
        api.MapPut("/budget-templates/{id}", async (string id, BudgetTemplateInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveBudgetTemplate(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/budget-templates/{id}/preview", async (string id, TemplateApply b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.TemplatePreview(FinanceEndpoints.User(c), id, b)));
        api.MapPost("/budget-templates/{id}/apply", async (string id, TemplateApply b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.TemplateConfirm(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/budget-alerts/settings", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AlertSettings(FinanceEndpoints.User(c))));
        api.MapPut("/budget-alerts/settings", async (BudgetAlertInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveAlertSettings(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/budget-alerts", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.BudgetAlerts(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/budget-alerts/evaluate", async (BudgetMonthInput b, FinanceService f, HttpContext c) => { FinanceService.Require(c.Request.Headers.IfMatch == "0", "预警检查版本应为0"); return await FinanceEndpoints.Write(c, f, b, async () => await f.EvaluateBudgetAlerts(FinanceEndpoints.User(c), b.Month), true); });
        api.MapPost("/budget-alerts/{id}/dismiss", async (string id, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, new { id }, async () => await f.DismissBudgetAlert(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true));
    }
}
public sealed record BudgetMonthInput(string Month);
