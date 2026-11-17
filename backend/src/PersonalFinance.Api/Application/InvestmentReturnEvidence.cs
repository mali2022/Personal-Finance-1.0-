using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> InvestmentReturnEvidence(string user,string start,string end,string currency,CancellationToken ct=default,DateTimeOffset? asOf=null)
    {
        var cutoff=DateOnly.FromDateTime((asOf??DateTimeOffset.UtcNow).ToOffset(TimeSpan.FromHours(8)).Date).ToString("yyyy-MM-dd");
        if(string.CompareOrdinal(end,cutoff)>0)end=cutoff;
        if(string.CompareOrdinal(start,end)>0)return new{status="InsufficientData",start,end,currency,items=Array.Empty<object>(),explanation="No elapsed calculation period"};
        var ids=await db.Set<InvestmentAsset>().AsNoTracking().Where(x=>x.UserId==user&&x.Currency==currency).OrderBy(x=>x.Id).Select(x=>x.Id).Take(21).ToArrayAsync(ct);
        if(ids.Length==0)return new{status="InsufficientData",start,end,currency,items=Array.Empty<object>(),explanation="No recorded assets; not zero investment return"};
        if(ids.Length>20)return new{status="ResourceLimit",start,end,currency,items=Array.Empty<object>(),explanation="More than 20 assets; choose assets in the investment workbench"};
        var result=JsonSerializer.SerializeToElement(await CompareInvestmentReturns(user,new(ids,start,end,currency),ct),Json);
        return new{status="Available",start,end,currency,items=result.GetProperty("items").EnumerateArray().Select(x=>new{id=x.GetProperty("id").GetString(),xirr=x.GetProperty("xirr").Clone(),amounts=x.GetProperty("amounts").Clone(),calculationId=x.GetProperty("calculationId").GetGuid()}),explanation="Actual/365 annualized single-asset returns; null/failed/missing is not 0%; never invent cash flows, valuations or aggregate XIRRs"};
    }
}
