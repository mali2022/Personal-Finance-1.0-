using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public static class InvestmentEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/investments/assets/{id}/project",async(string id,DateOnly? date,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InvestmentProject(FinanceEndpoints.User(c),id,date,c.RequestAborted)));
        api.MapPut("/investments/assets/{id}/project",async(string id,InvestmentProjectAssignmentInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInvestmentProject(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/investments/assets/{id}/return-trend", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentReturnTrend(FinanceEndpoints.User(c), id, c.Request.Query, c.RequestAborted)));
        api.MapPost("/investments/boundary-values", async (InvestmentBoundaryValueInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveInvestmentBoundaryValue(FinanceEndpoints.User(c), b), true));
        api.MapPost("/investments/returns/boundary", async (InvestmentBoundaryReturnInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentBoundaryReturn(FinanceEndpoints.User(c), b, c.RequestAborted)));
        api.MapPost("/investments/returns/compare", async (InvestmentReturnComparisonInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.CompareInvestmentReturns(FinanceEndpoints.User(c), b, c.RequestAborted)));
        api.MapPost("/investments/returns/periodic", (PeriodicReturnInput b, HttpContext c) => FinanceEndpoints.Ok(c, FinanceService.CalculatePeriodicReturn(b, c.RequestAborted)));
        api.MapGet("/investments/assets/{id}/returns", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentAssetReturn(FinanceEndpoints.User(c), id, c.Request.Query, c.RequestAborted)));
        api.MapPost("/investments/reinvestments", async (InvestmentTradeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.ReinvestDividend(FinanceEndpoints.User(c),b,c.Request.Headers.IfMatch),true));
        api.MapPost("/investments/reinvestments/{id}/correction-preview", async (string id, InvestmentCorrectionInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c,await f.RevokeReinvestment(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch,true)));
        api.MapPost("/investments/reinvestments/{id}/correct", async (string id, InvestmentCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c,f,b,async()=>await f.RevokeReinvestment(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch,false),true));
        api.MapGet("/investments/performance", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentPerformance(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/investments/assets", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentAssets(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/investments/assets/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentAssetDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/investments/assets", async (InvestmentAssetInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveInvestmentAsset(FinanceEndpoints.User(c), b, null, null), true));
        api.MapPut("/investments/assets/{id}", async (string id, InvestmentAssetInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveInvestmentAsset(FinanceEndpoints.User(c), b, id, c.Request.Headers.IfMatch), true));
        api.MapGet("/investments/positions", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentPositions(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/investments/trades", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentTrades(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapGet("/investments/trades/{id}", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentTradeDetail(FinanceEndpoints.User(c), id)));
        api.MapPost("/investments/trades", async (InvestmentTradeInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveInvestmentTrade(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapPost("/investments/trades/{id}/correction-preview", async (string id, InvestmentCorrectionInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.RevokeInvestmentTrade(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, true)));
        api.MapPost("/investments/trades/{id}/correct", async (string id, InvestmentCorrectionInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.RevokeInvestmentTrade(FinanceEndpoints.User(c), id, b, c.Request.Headers.IfMatch, false), true));
        api.MapGet("/investments/valuations", async (FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentValuations(FinanceEndpoints.User(c), c.Request.Query)));
        api.MapPost("/investments/valuations", async (InvestmentValuationInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.SaveInvestmentValuation(FinanceEndpoints.User(c), b, c.Request.Headers.IfMatch), true));
        api.MapPost("/investments/valuations/import-preview", async (InvestmentImportInput b, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentImportPreview(FinanceEndpoints.User(c), b, false)));
        api.MapPost("/investments/valuations/import", async (InvestmentImportInput b, FinanceService f, HttpContext c) => await FinanceEndpoints.Write(c, f, b, async () => await f.InvestmentImportPreview(FinanceEndpoints.User(c), b, true), true));
        api.MapGet("/investments/assets/{id}/history", async (string id, FinanceService f, HttpContext c) => FinanceEndpoints.Ok(c, await f.InvestmentHistoryList(FinanceEndpoints.User(c), id, c.Request.Query)));
    }
}


