namespace PersonalFinance.Api.Application;
public static class InterestEndpoints
{
 public static void Map(RouteGroupBuilder api) {
  InterestAiEndpoints.Map(api);
  api.MapGet("/concerts/interests/topics/{id}/history",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestTopicHistory(FinanceEndpoints.User(c),id)));
  api.MapGet("/concerts/interests/purchases/{id}/attachments",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestAttachments(FinanceEndpoints.User(c),id)));
  api.MapGet("/concerts/interests/purchases/{id}/history",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestHistory(FinanceEndpoints.User(c),id)));
  api.MapPost("/concerts/interests/purchases/{id}/approval",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.InterestApproval(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
  api.MapPost("/concerts/interests/purchases/{id}/attachments",async(string id,FinanceService f,HttpContext c)=>{var form=await c.Request.ReadFormAsync();var file=form.Files.GetFile("file");FinanceService.Require(file!=null,"请选择附件");return await FinanceEndpoints.Write(c,f,new{id,name=Path.GetFileName(file!.FileName),file.Length},async()=>await f.InterestUpload(FinanceEndpoints.User(c),id,file,c.Request.Headers.IfMatch));}).DisableAntiforgery();
  api.MapGet("/concerts/interests/purchases/{id}/attachments/{attachmentId}",async(string id,string attachmentId,FinanceService f,HttpContext c)=>{var d=await f.InterestDownload(FinanceEndpoints.User(c),id,attachmentId);return Results.File(d.Content,d.ContentType,d.Name[(id.Length+1)..]);});
  api.MapGet("/concerts/interests/candidates",async(string currency,int? page,string? keyword,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestCandidates(FinanceEndpoints.User(c),currency,page??1,keyword)));
  api.MapPost("/concerts/interests/batch-link",async(InterestBatch b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.InterestBatchLink(FinanceEndpoints.User(c),b),true));
  api.MapGet("/concerts/interests/catalog",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestCatalog(FinanceEndpoints.User(c))));
  api.MapGet("/concerts/interests/purchases",async(int? page,int? size,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestPurchases(FinanceEndpoints.User(c),page??1,size??20)));
  api.MapGet("/concerts/interests/report",async(string currency,int year,string? artist,string? brand,string? merchant,string? scene,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.InterestReport(FinanceEndpoints.User(c),currency,year,artist,brand,merchant,scene)));
  api.MapPost("/concerts/interests/purchases",async(InterestPurchase b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestPurchase(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
  api.MapPut("/concerts/interests/purchases/{id}",async(string id,InterestPurchase b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestPurchase(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
  api.MapPost("/concerts/interests/topics",async(InterestTopic b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestTopic(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
  api.MapPut("/concerts/interests/topics/{id}",async(string id,InterestTopic b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestTopic(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
  api.MapPost("/concerts/interests/links",async(InterestBrandLink b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestLink(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
  api.MapPut("/concerts/interests/links/{id}",async(string id,InterestBrandLink b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestLink(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
  api.MapPost("/concerts/interests/budgets",async(InterestBudget b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestBudget(FinanceEndpoints.User(c),null,b,c.Request.Headers.IfMatch),true));
  api.MapPut("/concerts/interests/budgets/{id}",async(string id,InterestBudget b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveInterestBudget(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
 }
}



