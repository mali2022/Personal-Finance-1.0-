using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;

namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    public async Task<object> CompareInvestmentReturns(string user, InvestmentReturnComparisonInput input, CancellationToken ct)
    {
        Require(input.AssetIds is { Length: >= 1 and <= 20 } && input.AssetIds.All(x => !string.IsNullOrWhiteSpace(x) && x.Length <= 36), "请选择1至20项资产");
        Require(input.AssetIds!.Distinct().Count() == input.AssetIds.Length, "对比资产不可重复");
        AssetCurrency(input.Currency);
        var query = new QueryCollection(new Dictionary<string, StringValues> { ["start"] = input.Start, ["end"] = input.End, ["currency"] = input.Currency });
        using var budget = CancellationTokenSource.CreateLinkedTokenSource(ct); budget.CancelAfter(TimeSpan.FromSeconds(10));
        try
        {
            await using var transaction = db.Database.CurrentTransaction == null ? await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, budget.Token) : null;
            var resource = "finance-user:" + user;
            await db.Database.ExecuteSqlInterpolatedAsync($"DECLARE @r int; EXEC @r=sys.sp_getapplock @Resource={resource},@LockMode='Shared',@LockOwner='Transaction',@LockTimeout=2000; IF @r<0 THROW 51001,'Investment comparison lock timeout',1;", budget.Token);
            var count = await db.Set<InvestmentAsset>().CountAsync(x => x.UserId == user && input.AssetIds.Contains(x.Id), budget.Token);
            if (count != input.AssetIds.Length) throw new ApiException(404, "投资资产不存在");
            Require(DateOnly.TryParseExact(input.End,"yyyy-MM-dd",out var classificationDate),"统计日期无效");
            var projects=await InvestmentProjects(user,input.AssetIds,classificationDate,budget.Token);
            var items = new List<object>();
            foreach (var id in input.AssetIds)
            {
                budget.Token.ThrowIfCancellationRequested();
                var value = JsonSerializer.SerializeToElement(await InvestmentAssetReturnCore(user, id, query, budget.Token), Json);
                items.Add(new { id, name = value.GetProperty("name").GetString(),
                    type=value.GetProperty("type").GetString(),
                    project=projects[id],
                    originalCurrency = value.GetProperty("originalCurrency").GetString(),
                    xirr = value.GetProperty("xirr").Clone(), amounts = value.GetProperty("amounts").Clone(),
                    calculationId = value.GetProperty("calculationId").GetGuid() });
            }
            if (transaction != null) await transaction.CommitAsync(budget.Token);
            return new { input.Start, input.End, input.Currency, items, scope = "Single-asset annualized XIRR comparison; identical period and report currency; not portfolio XIRR" };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        { throw new ApiException(503, "对比超过计算预算，请减少资产后重试", "INVESTMENT_RETURN_TIMEOUT"); }
        catch(OverflowException){throw new ApiException(422,"现金流或折算金额超出支持范围","INVESTMENT_RETURN_AMOUNT_OVERFLOW");}
        catch (Microsoft.Data.SqlClient.SqlException e) when (e.Number is 51001 or 1205 or -2)
        { throw new ApiException(503, "投资数据正在更新，请稍后重试", "INVESTMENT_RETURN_BUSY"); }
    }
}
