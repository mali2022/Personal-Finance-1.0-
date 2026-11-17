using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public static class FinanceEndpoints
{
    public static string User(HttpContext c) => c.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? throw new ApiException(401, "请先登录");
    public static IResult Ok(HttpContext c, object? data) => Results.Json(new { data, traceId = c.TraceIdentifier });
    public static async Task<IResult> Write(HttpContext c, FinanceService f, object body, Func<Task<object?>> action, bool key = false) => Ok(c, await f.Write(User(c), c, body, action, key));
    public static void Map(WebApplication app)
    {
        RuntimeHealth.Map(app);
        InvitationEndpoints.Map(app);
        app.MapGet("/api/version", (HttpContext c) => Ok(c, ProductRelease.Current));
        app.MapGet("/api/auth/csrf", () => Results.NoContent());
        app.MapGet("/api/auth/options", (IConfiguration configuration, HttpContext c) => Ok(c, new { registrationEnabled = AuthService.RegistrationEnabled(configuration), invitationActivationEnabled = AuthService.InvitationActivationEnabled(configuration) }));
        app.MapPost("/api/auth/register", async (RegisterInput b, AuthService a, HttpContext c) => Ok(c, await a.Register(b, c))).RequireRateLimiting("registration");
        app.MapPost("/api/auth/login", async (LoginInput b, AuthService a, HttpContext c) => Ok(c, await a.Login(b, c))).RequireRateLimiting("login");
        app.MapPost("/api/auth/refresh", async (AuthService a, HttpContext c) => Ok(c, await a.Refresh(c)));
        app.MapPost("/api/auth/logout", async (AuthService a, HttpContext c) => Ok(c, await a.Logout(c)));
        var api = app.MapGroup("/api").RequireAuthorization().AddEndpointFilter<RequestShapeFilter>();
        api.MapGet("/financial-diagnostics", async (FinanceService f, HttpContext c, CancellationToken ct) => Ok(c, await f.FinancialDiagnostics(User(c), ct, c.Request.Query["currency"].FirstOrDefault() ?? "CNY")));
        LifeSimulationEndpoints.Map(api);
        FestivalEndpoints.Map(api);
        SpendingValueEndpoints.Map(api);
        SpendingApprovalEndpoints.Map(api);
        api.MapGet("/auth/profile", async (AuthService a, HttpContext c) => Ok(c, await a.Profile(User(c))));
        api.MapPut("/auth/profile", async (ProfileInput b, AuthService a, HttpContext c) => Ok(c, await a.UpdateProfile(User(c), b, c)));
        api.MapPost("/auth/password", async (PasswordInput b, AuthService a, HttpContext c) => Ok(c, await a.ChangePassword(User(c), b, c))).RequireRateLimiting("profile");
        api.MapGet("/auth/avatar", async (FinanceDb db, HttpContext c) =>
        {
            var bytes = await db.Users.Where(x => x.Id == User(c)).Select(x => x.AvatarPng).SingleAsync();
            return bytes == null ? Results.NotFound() : Results.File(bytes, "image/png");
        });
        api.MapPut("/auth/avatar", async (AuthService a, HttpContext c) =>
        {
            if (c.Request.ContentLength > 2097152) throw new ApiException(413, "头像不得超过2MB", "AVATAR_INVALID");
            using var buffer = new MemoryStream(); var bytes = new byte[8192]; int count;
            while ((count = await c.Request.Body.ReadAsync(bytes, c.RequestAborted)) > 0)
            { if (buffer.Length + count > 2097152) throw new ApiException(413, "头像不得超过2MB", "AVATAR_INVALID"); await buffer.WriteAsync(bytes.AsMemory(0, count), c.RequestAborted); }
            return Ok(c, await a.Avatar(User(c), buffer.ToArray(), c));
        }).RequireRateLimiting("profile");
        api.MapDelete("/auth/avatar", async (AuthService a, HttpContext c) => Ok(c, await a.Avatar(User(c), null, c)));
        PayrollCenterEndpoints.Map(api);
        ImportCleaningEndpoints.Map(api);
        SmartReconciliationEndpoints.Map(api);
        FinancialReportCenterEndpoints.Map(api);
        SupportEndpoints.Map(api);
        TimeAssetEndpoints.Map(api);
        FuelEndpoints.Map(api);
        AccountManagementEndpoints.Map(api);
        StageGEndpoints.Map(api);
        api.MapGet("/promotions", async (FinanceService f, HttpContext c) => Ok(c, await f.Promotions(User(c))));
        api.MapPost("/promotions/transfer-drafts", async (SubsidizedTransfer b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SubsidizedTransferDraft(User(c), b), true));
        api.MapGet("/promotions/transfer-drafts", async (FinanceDb db, HttpContext c) => Ok(c, await db.Set<PersonalFinance.Api.Domain.PromotionTransferDraft>().Where(x => x.UserId == User(c)).Select(x => new { x.Id, x.AccountId, x.ToAccountId, x.Currency, paidAmount = FinanceService.M(x.PaidAmount), receivedAmount = FinanceService.M(x.ReceivedAmount), subsidyAmount = FinanceService.M(x.SubsidyAmount), x.Source, x.Evidence, x.TransferTransactionId, x.SubsidyTransactionId, x.State, x.OccurredAt, version = x.Version.ToString() }).ToArrayAsync()));
        api.MapPost("/promotions", async (SavePromotion b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SavePromotion(User(c), b, null, null), true));
        api.MapPut("/promotions/{id}", async (string id, SavePromotion b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SavePromotion(User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapGet("/promotions/{id}/history", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.PromotionHistory(User(c), id)));
        api.MapPost("/promotion-usages/{id}/return", async (string id, ReturnPromotion b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ReturnBenefit(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/promotions/transfer-drafts/{id}/confirm", async (string id, ConfirmSubsidizedTransfer b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ConfirmTransferDraft(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/cashbacks", async (FinanceService f, HttpContext c) => Ok(c, await f.Cashbacks(User(c))));
        api.MapPost("/promotions/transfer-drafts/{id}/revoke", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.RevokeTransferDraft(User(c), id, c.Request.Headers.IfMatch), true));
        api.MapPost("/cashback-recoveries/{id}/revoke", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.RevokeCashbackRecovery(User(c), id, c.Request.Headers.IfMatch), true));
        api.MapGet("/cashbacks/{id}/recoveries", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.CashbackRecoveries(User(c), id)));
        api.MapPost("/cashbacks/{id}/recover", async (string id, RecoverCashback b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.RecoverCashback(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/cashbacks", async (CreateCashback b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.CreateCashback(User(c), b), true));
        api.MapPost("/cashbacks/{id}/settle", async (string id, SettleCashback b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SettleCashback(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/cashbacks/{id}/revoke", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.RevokeCashback(User(c), id, c.Request.Headers.IfMatch), true));
        api.MapGet("/reports/promotions", async (FinanceService f, HttpContext c) => Ok(c, await f.PromotionReport(User(c), c.Request.Query)));
        api.MapGet("/reports/promotion-trend", async (FinanceService f, HttpContext c) => Ok(c, await f.PromotionReport(User(c), c.Request.Query)));
        api.MapGet("/transactions/{id}/promotions", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.TransactionPromotions(User(c), id)));
        api.MapPost("/transactions/promotion-preview", async (PromotionPreview b, FinanceService f, HttpContext c) => {
            var account = await f.Account(User(c), b.AccountId);
            return Ok(c, new { actualAmount = FinanceService.M(PromotionMath.Calculate(b.Promotion, account.Currency, b.Fee)), currency = account.Currency });
        });
        FinancialPlanningEndpoints.Map(api); InvestmentEndpoints.Map(api); AssetManagementEndpoints.Map(api);
        api.MapGet("/annual-budgets", async (FinanceService f, HttpContext c) => Ok(c, await f.AnnualBudgetList(User(c), c.Request.Query)));
        api.MapGet("/annual-budgets/{year:int}", async (int year, FinanceService f, HttpContext c) => Ok(c, await f.AnnualBudgetDetail(User(c), year)));
        api.MapGet("/annual-budgets/{year:int}/suggestion", async (int year, FinanceService f, HttpContext c) => Ok(c, await f.AnnualHistorySuggestion(User(c), year, c.Request.Query["total"]!)));
        api.MapPut("/annual-budgets/{year:int}", async (int year, AnnualBudgetInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveAnnualBudget(User(c), year, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/annual-budgets/{year:int}/history", async (int year, FinanceService f, HttpContext c) => Ok(c, await f.AnnualHistory(User(c), year, c.Request.Query)));
        api.MapPost("/annual-budgets/{year:int}/monthly-preview", async (int year, AnnualMonthlyApply b, FinanceService f, HttpContext c) => Ok(c, await f.AnnualMonthlyPreview(User(c), year, b)));
        api.MapPost("/annual-budgets/{year:int}/monthly-apply", async (int year, AnnualMonthlyApply b, FinanceService f, HttpContext c) => { FinanceService.Require(c.Request.Headers.IfMatch == b.AnnualVersion, "年度版本请求头无效"); return await Write(c, f, b, async () => await f.AnnualMonthlyConfirm(User(c), year, b), true); });
        api.MapGet("/operations/{key}", async (string key, FinanceService f, HttpContext c) => Ok(c, await f.OperationResult(User(c), key, c.Request.Query["fingerprint"])));
        api.MapGet("/audit-records", async (FinanceService f, HttpContext c) => Ok(c, await f.AuditHistory(User(c), null, c.Request.Query)));
        api.MapGet("/transactions/{id}/history", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.AuditHistory(User(c), id, c.Request.Query)));
        api.MapGet("/auth/me", async (FinanceDb db, HttpContext c) => Ok(c, AuthService.UserDto(await db.Users.SingleAsync(x => x.Id == User(c)))));
        api.MapGet("/accounts", async (FinanceService f, HttpContext c) => Ok(c, await f.Accounts(User(c))));
        api.MapPost("/accounts", async (SaveAccount b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveAccount(User(c), b, null, null), !string.IsNullOrEmpty(c.Request.Headers["Idempotency-Key"])));
        api.MapPut("/accounts/{id}", async (string id, SaveAccount b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveAccount(User(c), b, id, c.Request.Headers.IfMatch), !string.IsNullOrEmpty(c.Request.Headers["Idempotency-Key"])));
        api.MapGet("/categories", async (FinanceService f, HttpContext c) => Ok(c, (await f.Categories(User(c))).Select(x => new { x.Id, x.Name, x.Kind, x.ParentId, x.Status, x.SortOrder, version = x.Version.ToString() })));
        api.MapGet("/categories/overview", async (FinanceService f, HttpContext c) => Ok(c, await f.CategoryOverview(User(c), c.Request.Query["currency"].FirstOrDefault() ?? "CNY")));
        api.MapGet("/categories/{id}/statistics", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.CategoryStatistics(User(c), id, c.Request.Query["currency"].FirstOrDefault() ?? "CNY", c.Request.Query["month"].FirstOrDefault() ?? DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"))));
        api.MapPost("/categories", async (SaveCategory b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveCategory(User(c), b, null)));
        api.MapPut("/categories/{id}", async (string id, SaveCategory b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveCategory(User(c), b, id, c.Request.Headers.IfMatch)));
        api.MapPost("/categories/reorder", async (CategoryOrderInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ReorderCategories(User(c), b)));
        api.MapGet("/categories/{id}/deletion-preview", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.CategoryDeletionPreview(User(c), id)));
        api.MapDelete("/categories/{id}", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.DeleteCategory(User(c), id, c.Request.Headers.IfMatch)));
        api.MapPost("/categories/import-preview", async (CategoryImportInput b, FinanceService f, HttpContext c) => Ok(c, await f.CategoryImportPreview(User(c), b)));
        api.MapPost("/categories/import", async (CategoryImportInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ImportCategories(User(c), b), true));
        api.MapPost("/categories/deletion-preview", async (CategoryKindInput b, FinanceService f, HttpContext c) => Ok(c, await f.CategoryBulkDeletionPreview(User(c), b)));
        api.MapPost("/categories/batch-delete", async (CategoryBatchDelete b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.DeleteCategories(User(c), b), true));
        api.MapGet("/transactions", async (FinanceService f, HttpContext c) => Ok(c, await f.Transactions(User(c), c.Request.Query, c.RequestAborted)));
        api.MapGet("/transactions/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.Detail(User(c), id)));
        foreach (var type in new[] { "Expense", "Income", "Transfer", "Refund", "CreditCardPayment", "AssetLoss" })
        {
            api.MapPost("/transactions/" + type.ToLowerInvariant(), async (SaveTransaction b, FinanceService f, HttpContext c) => { FinanceService.Require(b.Type == type, "交易类型不匹配"); return await Write(c, f, b, async () => await f.SaveTransaction(User(c), b), true); });
            api.MapPut("/transactions/{id}/" + type.ToLowerInvariant(), async (string id, SaveTransaction b, FinanceService f, HttpContext c) => { FinanceService.Require(b.Type == type, "交易类型不匹配"); return await Write(c, f, b, async () => await f.SaveTransaction(User(c), b, id, c.Request.Headers.IfMatch), true); });
        }
        api.MapDelete("/transactions/{id}", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.ChangeTransaction(User(c), id, false, c.Request.Headers.IfMatch)));
        api.MapPost("/transactions/{id}/restore", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.ChangeTransaction(User(c), id, true, c.Request.Headers.IfMatch)));
        api.MapGet("/refund-sources/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.RefundSource(User(c), id, c.Request.Query["excludeRefundId"])));
        api.MapGet("/refund-sources", async (FinanceService f, HttpContext c) => Ok(c, await f.RefundSources(User(c), c.Request.Query)));
        api.MapGet("/dashboard", async (FinanceService f, HttpContext c) => Ok(c, await f.Dashboard(User(c), c.Request.Query["month"].ToString())));
        api.MapGet("/budgets/{month}", async (string month, FinanceService f, HttpContext c) => Ok(c, await f.Budget(User(c), month)));
        api.MapPut("/budgets/{month}", async (string month, BudgetInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveBudget(User(c), month, b, c.Request.Headers.IfMatch)));
        api.MapGet("/reports/summary", async (FinanceService f, HttpContext c) => Ok(c, await f.Report(User(c), c.Request.Query)));
        api.MapGet("/accounts/{id}/credit-card-statement", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.CardStatement(User(c), id, c.Request.Query["month"].FirstOrDefault() ?? DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(8)).ToString("yyyy-MM"))));
        api.MapGet("/directory/{kind}", async (string kind, FinanceService f, HttpContext c) => Ok(c, await f.Directory(User(c), kind, c.Request.Query)));
        api.MapPost("/directory/tags/defaults", async (JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ImportDefaultTags(User(c)), true));
        api.MapPost("/directory/{kind}", async (string kind, SaveDirectory b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveDirectory(User(c), kind, b, null, null)));
        api.MapPut("/directory/{kind}/{id}", async (string kind, string id, SaveDirectory b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveDirectory(User(c), kind, b, id, c.Request.Headers.IfMatch)));
        api.MapDelete("/directory/{kind}/{id}", async (string kind, string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.DeleteDirectory(User(c), kind, id, c.Request.Headers.IfMatch)));
        api.MapPost("/directory/{kind}/deletion-preview", async (string kind, DirectoryDeletion b, FinanceService f, HttpContext c) => Ok(c, await f.DirectoryDeletionPreview(User(c), kind, b)));
        api.MapPost("/directory/{kind}/batch-delete", async (string kind, DirectoryDeletion b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.DeleteDirectories(User(c), kind, b), true));
        api.MapPost("/transactions/batch-delete", async (TransactionDeletion b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.DeleteTransactions(User(c), b), true));
        api.MapGet("/business", async (FinanceService f, HttpContext c) => Ok(c, await f.Businesses(User(c), c.Request.Query)));
        api.MapDelete("/business/{id}", async (string id, FinanceService f, HttpContext c) => await Write(c, f, new { id }, async () => await f.DeleteLoan(User(c), id, c.Request.Headers.IfMatch)));
        api.MapGet("/business/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.BusinessDetail(User(c), id)));
        api.MapPost("/business", async (BusinessInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.CreateBusiness(User(c), b), true));
        api.MapPost("/business/{id}/settlements", async (string id, SettlementInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SettleBusiness(User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/business/{id}/status", async (string id, JsonElement b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.BusinessStatus(User(c), id, b.GetProperty("status").GetString()!, c.Request.Headers.IfMatch)));
        api.MapPost("/business/{id}/transactions/{transactionId}/{action}", async (string id, string transactionId, string action, FinanceService f, HttpContext c) => { FinanceService.Require(action is "delete" or "restore", "操作无效"); return await Write(c, f, new { action }, async () => await f.BusinessChange(User(c), id, transactionId, action == "restore", c.Request.Headers.IfMatch)); });
        api.MapGet("/settings/statistics/management", async (FinanceService f, HttpContext c) => Ok(c, await f.StatisticsManagement(User(c))));
        api.MapPut("/settings/statistics/management", async (StatisticsManagementInput b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.SaveStatisticsManagement(User(c), b, c.Request.Headers.IfMatch)));
        api.MapPost("/settings/statistics/management/preview", async (StatisticsManagementPreview b, FinanceService f, HttpContext c) => Ok(c, await f.PreviewStatisticsManagement(User(c), b)));
        api.MapGet("/settings/statistics/management/history", async (FinanceService f, HttpContext c) => Ok(c, await f.StatisticsManagementHistory(User(c))));
        api.MapGet("/settings/statistics/history", async (FinanceService f, HttpContext c) => Ok(c, await f.StatisticsPolicyHistory(User(c))));
        api.MapPost("/settings/statistics/preview", async (string month, string currency, RulesInput b, FinanceService f, HttpContext c) => Ok(c, await f.PreviewStatisticsPolicy(User(c), month, currency, b)));
        api.MapGet("/settings/statistics", async (FinanceService f, HttpContext c) => { var r = await f.Rules(User(c)); return Ok(c, new { r.IncludeFees, r.IncludeAssetLoss, r.IncludeDecreasingAdjustments, version = r.Version.ToString() }); });
        api.MapPut("/settings/statistics", async (RulesInput b, FinanceService f, FinanceDb db, HttpContext c) => await Write(c, f, b, async () => { var r = await db.Rules.SingleAsync(x => x.UserId == User(c)); FinanceService.Version(r, c.Request.Headers.IfMatch); r.IncludeFees = b.IncludeFees; r.IncludeAssetLoss = b.IncludeAssetLoss; r.IncludeDecreasingAdjustments = b.IncludeDecreasingAdjustments; r.Version++; return new { updated = true }; }));
        api.MapPost("/transactions/batch-preview", async (TransactionBatch b, FinanceService f, HttpContext c) => Ok(c, await f.BatchPreview(User(c), b)));
        api.MapPost("/transactions/batch-apply", async (TransactionBatch b, FinanceService f, HttpContext c) => await f.BatchExecute(c, b));
        api.MapGet("/transaction-batches/{id}", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.BatchResult(User(c), id)));
        api.MapGet("/transactions/{id}/review", async (string id, FinanceService f, HttpContext c) => Ok(c, await f.ReviewDetail(User(c), id)));
        api.MapPost("/transactions/{id}/review", async (string id, ReviewAction b, FinanceService f, HttpContext c) => await Write(c, f, b, async () => await f.ReviewUpdate(User(c), id, b, c.Request.Headers.IfMatch), true));
        TransactionWorkspaceEndpoints.Map(api); CollaborationEndpoints.Map(api);
        TransactionAiEndpoints.Map(api);
        OperationsEndpoints.Map(api);
        RecurringEndpoints.Map(api);
        AutomationEndpoints.Map(api);
    }
}









