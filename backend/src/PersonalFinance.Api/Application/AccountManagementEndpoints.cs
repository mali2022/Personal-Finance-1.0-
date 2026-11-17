using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Infrastructure;
namespace PersonalFinance.Api.Application;
public static class AccountManagementEndpoints
{
    public static void Map(RouteGroupBuilder api)
    {
        api.MapPost("/accounts/import",async(PersonalFinance.Api.Contracts.SaveAccount[] b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ImportAccounts(FinanceEndpoints.User(c),b),true));
        api.MapPost("/accounts/delete-all",async(AccountOrderInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.DeleteAllAccounts(FinanceEndpoints.User(c),b),true));
        api.MapDelete("/account-groups/{id}",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.DeleteAccountGroup(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        api.MapGet("/accounts/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountDetail(FinanceEndpoints.User(c),id)));
        api.MapGet("/accounts/{id}/statistics",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountStatistics(FinanceEndpoints.User(c),id,c.Request.Query)));
        api.MapGet("/accounts/{id}/activity-summary",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountActivitySummary(FinanceEndpoints.User(c),id,c.Request.Query)));
        api.MapGet("/accounts/{id}/delete-preview",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountDeletePreview(FinanceEndpoints.User(c),id)));
        api.MapDelete("/accounts/{id}",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.DeleteAccount(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        api.MapPost("/accounts/reorder",async(AccountOrderInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.ReorderAccounts(FinanceEndpoints.User(c),b),true));
        api.MapPost("/accounts/{id}/archive",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.AccountArchive(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch,false),true));
        api.MapPost("/accounts/{id}/unarchive",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.AccountArchive(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch,true),true));
        api.MapPut("/accounts/{id}/card",async(string id,AccountCardInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SetAccountCard(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        api.MapGet("/accounts/{id}/related-resources",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountRelatedResources(FinanceEndpoints.User(c),id)));
        api.MapGet("/accounts/{id}/health",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountHealth(FinanceEndpoints.User(c),id)));
        api.MapGet("/accounts/{id}/audit-history",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.AccountAudit(FinanceEndpoints.User(c),id,c.Request.Query)));
        api.MapGet("/account-groups",async(FinanceDb db,HttpContext c)=>FinanceEndpoints.Ok(c,await db.Set<AccountGroup>().Where(x=>x.UserId==FinanceEndpoints.User(c)).OrderBy(x=>x.SortOrder).Select(x=>new{x.Id,x.Name,x.SortOrder,version=x.Version.ToString()}).ToArrayAsync()));
        api.MapPost("/account-groups",async(AccountGroupInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveAccountGroup(FinanceEndpoints.User(c),b,null,null),true));
        api.MapPut("/account-groups/{id}",async(string id,AccountGroupInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.SaveAccountGroup(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
    }
}
