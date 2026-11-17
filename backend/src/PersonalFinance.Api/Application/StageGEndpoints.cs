using PersonalFinance.Api.Contracts;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public static class StageGEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/external-payment-facts", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ExternalPaymentFacts(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/external-payment-facts", async (ExternalPaymentFactInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveExternalPaymentFact(FinanceEndpoints.User(c), b), true));
        api.MapGet("/advances/plans", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AdvancePlans(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/advances/plans", async (AdvancePlanInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveAdvancePlan(FinanceEndpoints.User(c), b, null, null), true));
        api.MapPut("/advances/plans/{id}", async (string id, AdvancePlanInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveAdvancePlan(FinanceEndpoints.User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapPost("/advances/plans/{id}/cancel", async (string id, StageGReasonInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CancelAdvancePlan(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/advances/plans/{id}/purchase-preview", async (string id, AdvancePlanPurchaseInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PurchaseAdvancePlan(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/advances/plans/{id}/purchase", async (string id, AdvancePlanPurchaseInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.PurchaseAdvancePlan(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapPost("/fund-holds/{id}/correction-preview", async (string id, StageGCorrectionInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CorrectFundSettlement(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/fund-holds/{id}/correct", async (string id, StageGCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CorrectFundSettlement(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapPost("/prepayments/{id}/correction-preview", async (string id, StageGCorrectionInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CorrectPrepaymentSettlement(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/prepayments/{id}/correct", async (string id, StageGCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CorrectPrepaymentSettlement(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapPost("/advances/group-preview", async (AdvanceGroupInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CreateAdvanceGroup(FinanceEndpoints.User(c), b, true)));
        api.MapPost("/advances/groups", async (AdvanceGroupInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreateAdvanceGroup(FinanceEndpoints.User(c), b, false), true));
        api.MapGet("/payroll/summary", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PayrollSummary(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/social-contributions/summary", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ContributionSummary(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/housing-fund/withdrawals", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.HousingWithdrawals(FinanceEndpoints.User(c), c.Request.Query)));
        MemoryAiEndpoint.Map(api);
        api.MapGet("/reports/on-this-day/candidate", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.MemoryCandidate(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/memories/bookmarks", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.MemoryBookmarks(FinanceEndpoints.User(c))));
        api.MapPut("/memories/bookmarks", async (MemoryInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveMemory(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapGet("/reports/on-this-day", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.OnThisDay(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/advances", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.Advances(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/advances/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AdvanceDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/advances/preview", async (AdvanceInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CreateAdvance(FinanceEndpoints.User(c), b, true)));
        api.MapPost("/advances", async (AdvanceInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreateAdvance(FinanceEndpoints.User(c), b, false), true));
        api.MapPost("/advances/{id}/settlement-preview", async (string id, SettlementInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SettleAdvance(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/advances/{id}/settle", async (string id, SettlementInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SettleAdvance(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapPost("/advances/{id}/delivery", async (string id, AdvanceDeliveryInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.DeliverAdvance(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/advances/{id}/resolution-preview", async (string id, AdvanceResolutionInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ResolveAdvance(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/advances/{id}/resolve", async (string id, AdvanceResolutionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ResolveAdvance(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapGet("/product-prices", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ProductPrices(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/product-prices/defaults", async (JsonElement b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ImportDefaultProductPrices(FinanceEndpoints.User(c)), true));
        api.MapPost("/product-prices", async (PriceObservationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SavePriceObservation(FinanceEndpoints.User(c), b), true));
        api.MapGet("/living-cost/baskets", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.Baskets(FinanceEndpoints.User(c))));
        api.MapPost("/living-cost/baskets", async (BasketInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveBasket(FinanceEndpoints.User(c), b), true));
        api.MapGet("/living-cost/index", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.LivingCostIndex(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/prepayments", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.Prepayments(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/prepayments", async (PrepaymentInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreatePrepayment(FinanceEndpoints.User(c), b), true));
        api.MapGet("/prepayments/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PrepaymentHistory(FinanceEndpoints.User(c), id)));
        api.MapPost("/prepayments/{id}/settlement-preview", async (string id, PrepaymentAction b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SettlePrepayment(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/prepayments/{id}/settle", async (string id, PrepaymentAction b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SettlePrepayment(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapGet("/payroll", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PayrollList(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/payroll/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PayrollDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/payroll", async (PayrollInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SavePayroll(FinanceEndpoints.User(c), b, null, null), true));
        api.MapPut("/payroll/{id}", async (string id, PayrollInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SavePayroll(FinanceEndpoints.User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapPost("/payroll/{id}/reconcile", async (string id, PayrollReconcileInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ReconcilePayroll(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        api.MapPost("/payroll/{id}/unlink", async (string id, PayrollReconcileInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.UnlinkPayroll(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
        foreach (var housing in new[] { false, true })
        {
            var isHousing = housing; var path = housing ? "/housing-fund" : "/social-contributions";
            api.MapGet(path, async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.Contributions(FinanceEndpoints.User(c), c.Request.Query, isHousing)));
            api.MapPost(path, async (ContributionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveContribution(FinanceEndpoints.User(c), b, isHousing, null, null), true));
            api.MapPut(path + "/{id}", async (string id, ContributionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveContribution(FinanceEndpoints.User(c), b, isHousing, id, c.Request.Headers.IfMatch), true));
        }
        api.MapGet("/accounts/{id}/fund-status", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FundStatus(FinanceEndpoints.User(c), id)));
        api.MapGet("/fund-holds", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FundHolds(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/fund-holds", async (FundHoldInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreateFundHold(FinanceEndpoints.User(c), b), true));
        api.MapPost("/fund-holds/{id}/preview", async (string id, FundHoldAction b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ChangeFundHold(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/fund-holds/{id}/actions", async (string id, FundHoldAction b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ChangeFundHold(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapGet("/fund-holds/{id}/history", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FundHoldHistory(FinanceEndpoints.User(c), id)));
        api.MapGet("/fx/latest", async (string baseCurrency, string targetCurrency, LiveFxService fx, HttpContext c) => { c.Response.Headers.CacheControl="no-store"; return FinanceEndpoints.Ok(c, await fx.Quote(baseCurrency,targetCurrency,c.RequestAborted)); });
        api.MapGet("/currencies", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CurrencyCatalog(FinanceEndpoints.User(c))));
        api.MapPut("/currencies/{code}", async (string code, CurrencyPreferenceInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveCurrencyPreference(FinanceEndpoints.User(c), code, b, c.Request.Headers.IfMatch), true));
        api.MapGet("/fx-rates/valuation-preview", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FxPreview(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/payment-instruments", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.PaymentInstruments(FinanceEndpoints.User(c))));
        api.MapPost("/payment-instruments", async (PaymentInstrumentInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SavePaymentInstrument(FinanceEndpoints.User(c), b, null, null), true));
        api.MapPut("/payment-instruments/{id}", async (string id, PaymentInstrumentInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SavePaymentInstrument(FinanceEndpoints.User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapPost("/authorized-payments/preview", async (AuthorizedPaymentInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CreateAuthorizedPayment(FinanceEndpoints.User(c), b, true)));
        api.MapPost("/authorized-payments", async (AuthorizedPaymentInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.CreateAuthorizedPayment(FinanceEndpoints.User(c), b, false), true));
    }
}


