using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public static class AssetManagementEndpoints
{
 public static void Map(RouteGroupBuilder api)
 {
  PhysicalAssetEndpoints.Map(api);
  foreach (var deposits in new[] { true, false })
  {
   var path = deposits ? "/term-deposits" : "/physical-assets";
   api.MapGet(path, async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ManagedAssets(FinanceEndpoints.User(c), deposits, c.Request.Query)));
   api.MapGet(path + "/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ManagedDetail(FinanceEndpoints.User(c), id)));
   api.MapPost(path, async (ManagedAssetInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveManagedAsset(FinanceEndpoints.User(c), b, deposits, null, null), true));
   api.MapPut(path + "/{id}", async (string id, ManagedAssetInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveManagedAsset(FinanceEndpoints.User(c), b, deposits, id, c.Request.Headers.IfMatch), true));
  }
  api.MapGet("/physical-assets/{id}/valuations", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ManagedValuations(FinanceEndpoints.User(c), id, c.Request.Query)));
  api.MapPost("/physical-assets/{id}/valuations", async (string id, ManagedValuationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveManagedValuation(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch), true));
  api.MapPost("/term-deposits/{id}/settlement-preview", async (string id, DepositSettlementInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.SettleDeposit(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
  api.MapPost("/term-deposits/{id}/settle", async (string id, DepositSettlementInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SettleDeposit(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
  api.MapGet("/fx-valuation-rates", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.FxValuations(FinanceEndpoints.User(c), c.Request.Query)));
  api.MapPost("/fx-valuation-rates", async (FxValuationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveFxValuation(FinanceEndpoints.User(c), b), true));
  api.MapPut("/assets/aggregation-policy", async (AggregationPolicyInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveAggregationPolicy(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
  api.MapGet("/assets/allocation", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AssetAllocation(FinanceEndpoints.User(c), c.Request.Query)));
  api.MapGet("/assets/valuation", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.AssetAllocation(FinanceEndpoints.User(c), c.Request.Query)));
  api.MapPost("/reports/custom/{id}/delete", async (string id, InvestmentCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.DeleteCustomReport(FinanceEndpoints.User(c), id, c.Request.Headers.IfMatch), true));
  api.MapGet("/reports/custom", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CustomReports(FinanceEndpoints.User(c), c.Request.Query)));
  api.MapPost("/reports/custom", async (CustomReportInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveCustomReport(FinanceEndpoints.User(c), b, null, null), true));
  api.MapPut("/reports/custom/{id}", async (string id, CustomReportInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveCustomReport(FinanceEndpoints.User(c), b, id, c.Request.Headers.IfMatch), true));
  api.MapPost("/reports/custom/preview", async (CustomReportInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CustomReportPreview(FinanceEndpoints.User(c), b)));
  api.MapPost("/reports/custom/export", async (CustomReportExportInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.ExportCustomReport(FinanceEndpoints.User(c), b), true));
  api.MapPost("/reports/custom/{id}/execute", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.ExecuteCustomReport(FinanceEndpoints.User(c), id)));
 }
}

