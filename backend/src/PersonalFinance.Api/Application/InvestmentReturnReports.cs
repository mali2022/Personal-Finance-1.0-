using Microsoft.EntityFrameworkCore;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
using System.Text.Json;
namespace PersonalFinance.Api.Application;
public sealed partial class FinanceService
{
    private async Task<object> CustomInvestmentReturnReport(string user, CustomReportInput input, DateTimeOffset? asOf)
    {
        Require(input.Metrics == null || input.Metrics.All(x => x is "xirrPercent" or "totalProfit"), "投资收益率主题仅支持年化XIRR及期间总收益");
        var end = input.End;
        if (asOf != null)
        {
            var cutoff = DateOnly.FromDateTime(asOf.Value.ToOffset(TimeSpan.FromHours(8)).Date).ToString("yyyy-MM-dd");
            if (string.CompareOrdinal(end, cutoff) > 0) end = cutoff;
        }
        var ids = await db.Set<InvestmentAsset>().AsNoTracking().Where(x => x.UserId == user && (input.AccountId == null || x.AccountId == input.AccountId))
            .OrderBy(x => x.Id).Select(x => x.Id).Take(21).ToArrayAsync();
        Require(ids.Length <= 20, "收益率报表最多20项资产，请在投资工作台选择资产对比");
        var rows = new List<object>();
        if (ids.Length > 0)
        {
            var comparison = JsonSerializer.SerializeToElement(await CompareInvestmentReturns(user, new(ids, input.Start, end, input.Currency), CancellationToken.None), Json);
            foreach (var item in comparison.GetProperty("items").EnumerateArray())
            {
                var rate = item.GetProperty("xirr"); var status = rate.GetProperty("status").GetString();
                rows.Add(new { key = item.GetProperty("id").GetString(), label = item.GetProperty("name").GetString(),
                    income = "0.00", expense = "0.00", count = 0,
                    xirrPercent = status == "Success" && rate.GetProperty("rate").ValueKind == JsonValueKind.Number ? (rate.GetProperty("rate").GetDouble() * 100).ToString("G17", System.Globalization.CultureInfo.InvariantCulture) : null,
                    totalProfit = item.GetProperty("amounts").GetProperty("reportTotalProfit").GetString(),
                    missing = status == "Success" ? null : status,
                    calculationId = item.GetProperty("calculationId").GetGuid() });
            }
        }
        return new { input.Start, end, input.Currency, input.Theme, groupBy = "asset", metrics = input.Metrics ?? ["xirrPercent", "totalProfit"],
            income = "0.00", expense = "0.00", surplus = "0.00", rows,
            scope = "单资产年化XIRR（百分数，Actual/365）与期间总收益；精确日期历史汇率，缺失结果留空并列状态码。复用投资工作台服务，不将收益率相加或称为组合收益率。最多20项。" };
    }
}
