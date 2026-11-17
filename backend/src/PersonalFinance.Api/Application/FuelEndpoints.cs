namespace PersonalFinance.Api.Application;
public static class FuelEndpoints
{
    public static void Map(RouteGroupBuilder api){
        var r=api.MapGroup("/fuel");
        FuelAiEndpoints.Map(r);
        r.MapGet("/budget-overview",async(string period,string? vehicleId,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.VehicleBudgetOverview(FinanceEndpoints.User(c),period,vehicleId)));
        r.MapGet("/records/{id}/assessment",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelAssessmentDetail(FinanceEndpoints.User(c),id)));
        r.MapPost("/record-receipts",async(FuelRecordWithReceipt b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveWithReceipt(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/record-receipts/{id}",async(string id,FuelRecordWithReceipt b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveWithReceipt(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapGet("/records/{id}/receipts",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelReceipts(FinanceEndpoints.User(c),id)));
        r.MapGet("/records/{id}/receipts/{receiptId}",async(string id,string receiptId,FinanceService f,HttpContext c)=>{var d=await f.FuelReceipt(FinanceEndpoints.User(c),id,receiptId);c.Response.Headers.CacheControl="no-store";c.Response.Headers.XContentTypeOptions="nosniff";return Results.File(d.Content,d.ContentType,d.Name.Substring(id.Length+1));});
        r.MapPost("/records/{id}/receipts/{receiptId}/delete",async(string id,string receiptId,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id,receiptId},async()=>await f.FuelDeleteReceipt(FinanceEndpoints.User(c),id,receiptId,c.Request.Headers.IfMatch),true));
        r.MapGet("/stations",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelStations(FinanceEndpoints.User(c))));
        r.MapPost("/stations",async(FuelStationInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveStation(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/stations/{id}",async(string id,FuelStationInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveStation(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/stations/{id}/merge",async(string id,FuelStationMerge b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelMergeStation(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch,b),true));
        r.MapPost("/decisions/preview",async(VehicleDecisionInput b,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.VehicleDecisions(FinanceEndpoints.User(c),b,false,c.RequestAborted)));
        r.MapPost("/decisions/save",async(VehicleDecisionInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleDecisions(FinanceEndpoints.User(c),b,true,c.RequestAborted),true));
        r.MapPost("/vehicles/{id}/approval",async(string id,ApprovalApplication b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleApprovalDraft(FinanceEndpoints.User(c),id,b),true));
        r.MapGet("/vehicles/{id}/planning",async(string id,DateOnly from,DateOnly to,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.VehiclePlanning(FinanceEndpoints.User(c),id,from,to)));
        r.MapPut("/vehicles/{id}/asset",async(string id,VehicleAssetInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleLinkAsset(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        r.MapPost("/vehicles/{id}/asset-rule",async(string id,VehicleAssetRuleInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleAssetRule(FinanceEndpoints.User(c),id,b),true));
        r.MapPost("/vehicle-budgets",async(VehicleBudgetInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleSaveBudget(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/vehicle-budgets/{id}",async(string id,VehicleBudgetInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleSaveBudget(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/vehicle-budgets/{id}/delete",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.VehicleDeleteBudget(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        r.MapGet("/costs",async(string? vehicleId,DateOnly from,DateOnly to,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.VehicleCostReport(FinanceEndpoints.User(c),vehicleId,from,to)));
        r.MapGet("/costs/candidates",async(string vehicleId,string? fuelRecordId,string? keyword,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.VehicleCostCandidates(FinanceEndpoints.User(c),vehicleId,fuelRecordId,keyword)));
        r.MapPost("/costs",async(VehicleCostInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleCostSave(FinanceEndpoints.User(c),b),true));
        r.MapPost("/costs/create-transaction",async(VehicleCostCreate b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.VehicleCostCreateTransaction(FinanceEndpoints.User(c),b),true));
        r.MapPost("/costs/{id}/unlink",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.VehicleCostUnlink(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        r.MapGet("/records/trash",async(int? page,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelTrash(FinanceEndpoints.User(c),page??1)));
        r.MapPost("/records/bulk",async(FuelBulkInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelBulk(FinanceEndpoints.User(c),b),true));
        r.MapPost("/records/import/preview",async(FuelImportInput b,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelPreviewImport(FinanceEndpoints.User(c),b)));
        r.MapPost("/records/import/confirm",async(FuelImportInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelConfirmImport(FinanceEndpoints.User(c),b),true));
        r.MapPost("/strategies/preview", (FuelStrategyInput b,HttpContext c)=>FinanceEndpoints.Ok(c,FuelStrategyMath.Calculate(b)));
        r.MapGet("/strategies",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelStrategies(FinanceEndpoints.User(c))));
        r.MapPost("/strategies",async(FuelStrategyInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveStrategy(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/strategies/{id}",async(string id,FuelStrategyInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveStrategy(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/strategies/{id}/delete",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.FuelDeleteStrategy(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        r.MapGet("/vehicles",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelVehicles(FinanceEndpoints.User(c))));
        r.MapGet("/report",async(string? vehicleId,DateOnly from,DateOnly to,string currency,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.FuelReport(FinanceEndpoints.User(c),vehicleId,from,to,currency)));
        r.MapPost("/vehicles",async(FuelVehicleInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveVehicle(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/vehicles/{id}",async(string id,FuelVehicleInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveVehicle(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/records",async(FuelRecordInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveRecord(FinanceEndpoints.User(c),b,null,null),true));
        r.MapPut("/records/{id}",async(string id,FuelRecordInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.FuelSaveRecord(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        r.MapPost("/{kind}/{id}/delete",async(string kind,string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{kind,id},async()=>await f.FuelDelete(FinanceEndpoints.User(c),kind,id,c.Request.Headers.IfMatch),true));
    }
}
