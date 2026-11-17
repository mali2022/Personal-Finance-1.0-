using System.Text.Json;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public static class PayrollCenterEndpoints
{
    public sealed record CopyInput(string Month, DateOnly PayDate);
    public static void Map(RouteGroupBuilder api)
    {
        var p=api.MapGroup("/payroll-center");
        p.MapPost("/contributions/sync",async(FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{source="payroll"},async()=>await f.PayrollContributionSync(FinanceEndpoints.User(c)),true));
        p.MapDelete("/contributions/{id}",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.PayrollContributionDelete(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        p.MapGet("/legacy-fund-balances",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollLegacyBalances(FinanceEndpoints.User(c))));
        p.MapGet("/tax-context",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollTaxContext(FinanceEndpoints.User(c),c.Request.Query["employmentId"].ToString(),c.Request.Query["month"].ToString())));
        p.MapPost("/wage-scenarios",async(PayrollWageScenario b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollWageSimulate(FinanceEndpoints.User(c),b),true));
        p.MapGet("/employers",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollEmployers(FinanceEndpoints.User(c))));
        p.MapGet("/employments",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollEmployments(FinanceEndpoints.User(c))));
        p.MapDelete("/plans/{id}",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.PayrollPlanDelete(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        p.MapDelete("/slips/{id}",async(string id,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,new{id},async()=>await f.PayrollCenterDelete(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        p.MapGet("/plans",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollPlans(FinanceEndpoints.User(c))));
        p.MapGet("/policies",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollPolicies(FinanceEndpoints.User(c))));
        p.MapGet("/fund-accounts",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollFundAccounts(FinanceEndpoints.User(c))));
        p.MapGet("/fund-events",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollFundEvents(FinanceEndpoints.User(c))));
        p.MapGet("/tax-rules",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollTaxRules(FinanceEndpoints.User(c))));
        p.MapGet("/declarations",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollDeclarations(FinanceEndpoints.User(c))));
        p.MapGet("/tax-calculations",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollTaxCalculations(FinanceEndpoints.User(c))));
        p.MapGet("/slips",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterSlips(FinanceEndpoints.User(c),c.Request.Query)));
        p.MapGet("/statistics",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterStatistics(FinanceEndpoints.User(c),c.Request.Query)));
        p.MapGet("/summary",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterStatistics(FinanceEndpoints.User(c),c.Request.Query)));
        p.MapGet("/calendar",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterCalendar(FinanceEndpoints.User(c),c.Request.Query)));
        p.MapGet("/contributions",async(FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollContributions(FinanceEndpoints.User(c),c.Request.Query)));
        p.MapPost("/employers",async(EmployerSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollEmployerSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/employers/{id}",async(string id,EmployerSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollEmployerSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/employments",async(EmploymentSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollEmploymentSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/employments/{id}",async(string id,EmploymentSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollEmploymentSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/plans",async(PlanSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollPlanSave(FinanceEndpoints.User(c),b),true));
        p.MapPost("/policies",async(InsurancePolicySave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollPolicySave(FinanceEndpoints.User(c),b),true));
        p.MapPost("/fund-accounts",async(FundAccountSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollFundSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/fund-accounts/{id}",async(string id,FundAccountSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollFundSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/fund-events",async(FundEventSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollFundEventSave(FinanceEndpoints.User(c),b),true));
        p.MapPost("/tax-rules",async(TaxRuleSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollTaxRuleSave(FinanceEndpoints.User(c),b),true));
        p.MapPost("/declarations",async(DeclarationSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollDeclarationSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/declarations/{id}",async(string id,DeclarationSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollDeclarationSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/contributions",async(ContributionSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollContributionSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/contributions/{id}",async(string id,ContributionSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollContributionSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/slips",async(SlipSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterSave(FinanceEndpoints.User(c),b,null,null),true));
        p.MapPut("/slips/{id}",async(string id,SlipSave b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterSave(FinanceEndpoints.User(c),b,id,c.Request.Headers.IfMatch),true));
        p.MapPost("/tax-simulations",async(TaxSimulation b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollSimulateTax(FinanceEndpoints.User(c),b),true));
        p.MapPost("/slips/generate",async(SlipGenerate b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterGenerate(FinanceEndpoints.User(c),b),true));
        p.MapGet("/tax-template",()=> {var a=typeof(PayrollCenterEndpoints).Assembly;using var stream=a.GetManifestResourceStream(a.GetManifestResourceNames().Single(x=>x.EndsWith("PayrollTaxTemplate.json")))!;return Results.Json(new{data=JsonSerializer.Deserialize<JsonElement>(stream)});});
        p.MapGet("/slips/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterDetail(FinanceEndpoints.User(c),id)));
        p.MapGet("/slips/{id}/history",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollCenterHistory(FinanceEndpoints.User(c),id)));
        p.MapGet("/slips/{id}/matches",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollMatchCandidates(FinanceEndpoints.User(c),id,int.TryParse(c.Request.Query["tolerance"],out var d)?d:7)));
        p.MapPost("/slips/{id}/actions",async(string id,SlipAction b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterAction(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        p.MapPost("/slips/{id}/copy",async(string id,CopyInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterCopy(FinanceEndpoints.User(c),id,b.Month,b.PayDate),true));
        p.MapPost("/slips/{id}/reconcile",async(string id,PayrollMatch b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollCenterReconcile(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        p.MapPost("/slips/{id}/unlink",async(string id,PayrollReconcileInput b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.UnlinkPayroll(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        p.MapPost("/slips/{id}/attachments",async(string id,FinanceService f,HttpContext c)=>{var form=await c.Request.ReadFormAsync();var file=form.Files.GetFile("file")??throw new ApiException(422,"请选择工资条附件");return await FinanceEndpoints.Write(c,f,new{file.FileName,file.Length},async()=>await f.PayrollAttachmentSave(FinanceEndpoints.User(c),id,file));});
        p.MapGet("/documents/{id}",async(string id,FinanceService f,HttpContext c)=>{var d=await f.PayrollDocument(FinanceEndpoints.User(c),id);c.Response.Headers.CacheControl="no-store";return Results.File(d.Content,d.ContentType,d.Name);});
        p.MapPost("/imports",async(FinanceService f,HttpContext c)=>{var form=await c.Request.ReadFormAsync();var file=form.Files.GetFile("file")??throw new ApiException(422,"请选择工资文件");return await FinanceEndpoints.Write(c,f,new{file.FileName,file.Length},async()=>await f.PayrollImportUpload(FinanceEndpoints.User(c),file));});
        p.MapGet("/imports/{id}",async(string id,FinanceService f,HttpContext c)=>FinanceEndpoints.Ok(c,await f.PayrollImportDetail(FinanceEndpoints.User(c),id)));
        p.MapPost("/imports/{id}/preview",async(string id,PayrollImportPreview b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollImportPreviewSave(FinanceEndpoints.User(c),id,b,c.Request.Headers.IfMatch),true));
        p.MapPost("/imports/{id}/commit",async(string id,PayrollImportCommit b,FinanceService f,HttpContext c)=>await FinanceEndpoints.Write(c,f,b,async()=>await f.PayrollImportSave(FinanceEndpoints.User(c),id,c.Request.Headers.IfMatch),true));
        p.MapGet("/imports",async(PersonalFinance.Api.Infrastructure.FinanceDb db,HttpContext c)=>{var rows=await Microsoft.EntityFrameworkCore.EntityFrameworkQueryableExtensions.ToArrayAsync(db.Set<PersonalFinance.Api.Domain.PayrollImportJob>().Where(x=>x.UserId==FinanceEndpoints.User(c)).OrderByDescending(x=>x.CreatedAt).Take(100).Select(x=>new{x.Id,x.FileName,x.State,x.Imported,x.CreatedAt,version=x.Version.ToString()}));return FinanceEndpoints.Ok(c,rows);});
    }
}
