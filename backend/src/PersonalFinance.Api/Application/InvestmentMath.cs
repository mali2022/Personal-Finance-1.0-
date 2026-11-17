using PersonalFinance.Api.Domain;
using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record InvestmentCost(decimal Quantity, decimal Cost, decimal Realized, decimal Income, decimal Fees);
public static class InvestmentMath
{
    public static decimal CashMovement(InvestmentTrade trade) => trade.Type switch
    {
        "Buy" => -trade.Amount - trade.Commission - trade.Tax - trade.OtherFee,
        "Sell" or "Dividend" or "Interest" => trade.Amount - trade.Commission - trade.Tax - trade.OtherFee,
        "Fee" => -trade.Amount,
        "PositionIncrease" or "PositionDecrease" => 0,
        _ => throw new ApiException(422, "投资交易类型无效")
    };
    // Every investment history mutation must remain valid both when traded and when settled.
    public static InvestmentCost ValidateHistory(IEnumerable<InvestmentTrade> trades)
    {
        var active = trades.Where(x => x.State == "Active").ToArray();
        var cost = Calculate(active);
        decimal settled = 0;
        foreach (var row in active.OrderBy(x => x.SettlementDate).ThenBy(x => x.Date).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id))
        {
            settled += row.Type is "Buy" or "PositionIncrease" ? row.Quantity : row.Type is "Sell" or "PositionDecrease" ? -row.Quantity : 0;
            FinanceService.Require(settled >= 0, "结算历史产生负可用持仓，拒绝提交");
        }
        return cost;
    }

    public static InvestmentCost Calculate(IEnumerable<InvestmentTrade> trades)
    {
        decimal quantity = 0, cost = 0, realized = 0, income = 0, fees = 0;
        foreach (var t in trades.Where(x => x.State == "Active").OrderBy(x => x.Date).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id))
        {
            var fee = t.Commission + t.Tax + t.OtherFee;
            fees += fee;
            switch (t.Type)
            {
                case "PositionIncrease": case "Buy": quantity += t.Quantity; cost += t.Amount + fee; break;
                case "PositionDecrease": case "Sell":
                    if (t.Quantity > quantity || t.Quantity <= 0) throw new ApiException(422, "历史重算产生负持仓，拒绝提交");
                    var disposed = t.Quantity == quantity ? cost : decimal.Round(cost * t.Quantity / quantity, 8, MidpointRounding.AwayFromZero);
                    quantity -= t.Quantity; cost -= disposed; if(t.Type == "Sell") realized += t.Amount - fee - disposed; break;
                case "Dividend": case "Interest": income += t.Amount - fee; break;
                case "Fee": realized -= t.Amount; fees += t.Amount; break;
                default: throw new ApiException(422, "投资交易类型无效");
            }
        }
        return new(quantity, cost, realized, income, fees);
    }
    public static decimal Gross(decimal quantity, decimal price) => decimal.Round(quantity * price, 2, MidpointRounding.AwayFromZero);
}

