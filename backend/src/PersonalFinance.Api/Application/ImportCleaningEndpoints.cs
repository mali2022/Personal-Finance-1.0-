using PersonalFinance.Api.Application.Ai;
namespace PersonalFinance.Api.Application;

public static class ImportCleaningEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/imports",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ImportJobHistory(FinanceEndpoints.User(c),c.Request.Query)));
        api.MapGet("/imports/{id}/source-file",async(string id,FinanceService f,HttpContext c)=>{var doc=await f.ImportSourceDocument(FinanceEndpoints.User(c),id);c.Response.Headers.CacheControl="no-store";return Results.File(doc.Content,doc.ContentType,doc.Name);});
        api.MapGet("/merchant-master",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.MerchantMasterList(FinanceEndpoints.User(c),c.Request.Query)));
        api.MapPost("/merchant-master/{id}/aliases",async(string id,MerchantAliasInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.MerchantAliasSave(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/merchant-master/aliases/{id}/remove",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.MerchantAliasRemove(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        api.MapPost("/merchant-master/{id}/merge-preview",async(string id,MerchantMergeInput b,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.MerchantMergePreview(FinanceEndpoints.User(c),id,b)));
        api.MapPost("/merchant-master/{id}/merge",async(string id,MerchantMergeInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.MerchantMergeApply(FinanceEndpoints.User(c),id,b),true));
        api.MapGet("/imports/{id}/cleaning",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ImportCleaningHistory(FinanceEndpoints.User(c),id,c.Request.Query)));
        api.MapGet("/imports/{id}/cleaning-export",async(string id,FinanceService f,HttpContext c)=>{c.Response.Headers.CacheControl="no-store";return FinanceEndpoints.Ok(c,await f.ImportCleaningExport(FinanceEndpoints.User(c),id));});
        api.MapPost("/imports/{id}/cleaning/{eventId}/undo",async(string id,string eventId,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{eventId},async()=>await f.UndoImportCleaning(FinanceEndpoints.User(c),id,eventId,c.Request.Headers.IfMatch),true));
        api.MapPost("/imports/{id}/normalize-merchants",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.RefreshImportMerchants(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        api.MapGet("/imports/{id}/suggestions",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.ImportSuggestions(FinanceEndpoints.User(c),id)));
        api.MapPost("/imports/{id}/suggestions/{suggestionId}/decision",async(string id,string suggestionId,ImportSuggestionDecision b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ApplyImportSuggestion(FinanceEndpoints.User(c),id,suggestionId,b,c.Request.Headers.IfMatch),true));
        api.MapPost("/ai/import-recognition",async(ImportRecognitionInput b,ImportRecognitionService service,HttpContext c)=>FinanceEndpoints.Ok(c,await service.Generate(c,b))).RequireRateLimiting("ai");
    }
}
