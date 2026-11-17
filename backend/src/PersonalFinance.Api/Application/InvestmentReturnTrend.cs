using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> InvestmentReturnTrend(string user,string id,IQueryCollection query,CancellationToken ct)
    {
        Require(DateOnly.TryParseExact(query["start"],"yyyy-MM-dd",out var first)&&DateOnly.TryParseExact(query["end"],"yyyy-MM-dd",out _),"日期无效");
        var last=DateOnly.ParseExact(query["end"]!,"yyyy-MM-dd");
        Require(first.Year>=1901&&last>=first&&(last.Year-first.Year)*12+last.Month-first.Month<24,"趋势最多24个月，请缩小范围");
        using var budget=CancellationTokenSource.CreateLinkedTokenSource(ct);budget.CancelAfter(TimeSpan.FromSeconds(10));
        try {
            await using var transaction=await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable,budget.Token);
            var points=new List<object>();
            for(var month=new DateOnly(first.Year,first.Month,1);month<=last;month=month.AddMonths(1)) {
                var at=month.AddMonths(1).AddDays(-1);if(at>last)at=last;
                var parameters=new QueryCollection(new Dictionary<string,StringValues>{{"start",first.ToString("yyyy-MM-dd")},{"end",at.ToString("yyyy-MM-dd")},{"currency",query["currency"]}});
                var value=JsonSerializer.SerializeToElement(await InvestmentAssetReturnCore(user,id,parameters,budget.Token),Json);
                points.Add(new{date=at,xirr=value.GetProperty("xirr").Clone(),
                    totalProfit=value.GetProperty("amounts").GetProperty("reportTotalProfit").GetString(),
                    closingValue=value.GetProperty("amounts").GetProperty("reportClosingValue").GetString(),
                    netCashInvested=value.GetProperty("amounts").GetProperty("netCashInvested").GetString(),
                    amountStatus=value.GetProperty("amounts").GetProperty("status").GetString()});
            }
            await transaction.CommitAsync(budget.Token);return new{start=first,end=last,currency=query["currency"].ToString(),points,policy="Each point is a cumulative return from the selected start to the actual month end; exact-date valuations only; missing observations remain null, never interpolated."};
        }catch(OperationCanceledException)when(!ct.IsCancellationRequested){throw new ApiException(503,"趋势超过预算，请缩小范围","INVESTMENT_RETURN_TIMEOUT");}
        catch(OverflowException){throw new ApiException(422,"现金流或折算金额超出支持范围","INVESTMENT_RETURN_AMOUNT_OVERFLOW");}
        catch(Microsoft.Data.SqlClient.SqlException e)when(e.Number is 51001 or 1205 or -2){throw new ApiException(503,"投资数据正在更新，请重试","INVESTMENT_RETURN_BUSY");}
    }
}
