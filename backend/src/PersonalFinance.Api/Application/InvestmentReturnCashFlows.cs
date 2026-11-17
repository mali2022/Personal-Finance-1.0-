using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record InvestmentReturnFlow(DateOnly Date, decimal Amount, string Type, string SourceId);
public sealed record InvestmentReturnAnalysis(ReturnResult Xirr, InvestmentReturnFlow[] CashFlows, string Policy);

public static class InvestmentReturnCashFlows
{
    public static InvestmentReturnAnalysis Calculate(IEnumerable<InvestmentTrade> trades,
        IEnumerable<InvestmentValuation> valuations, DateOnly start, DateOnly end, CancellationToken ct = default)
    {
        const string policy = "Asset boundary; settlement dates; opening value immediately before start; closing value at end; exact-date valuations required; Actual/365; original currency.";
        InvestmentReturnAnalysis Fail(string status, InvestmentReturnFlow[] flows) =>
            new(new(status, null, [], "XIRR-Actual365"), flows, policy);
        if (start > end || start == DateOnly.MinValue) return Fail("InvalidCashFlow", []);
        var rows = trades.Where(x => x.State == "Active" && x.SettlementDate <= end).ToArray();
        if (rows.Any(x => x.Type is "PositionIncrease" or "PositionDecrease")) return Fail("TransferValuationMissing", []);
        var prices = valuations.ToArray();
        var opening = InvestmentMath.Calculate(rows.Where(x => x.SettlementDate < start));
        var closing = InvestmentMath.Calculate(rows);
        var flows = new List<InvestmentReturnFlow>();
        if (opening.Quantity > 0)
        {
            var value = prices.SingleOrDefault(x => x.Date == start.AddDays(-1));
            if (value == null) return Fail("ValuationMissing", []);
            flows.Add(new(start, -opening.Quantity * value.Price, "OpeningValue", value.Id));
        }
        flows.AddRange(rows.Where(x => x.SettlementDate >= start)
            .OrderBy(x => x.SettlementDate).ThenBy(x => x.Id)
            .Select(x => new InvestmentReturnFlow(x.SettlementDate, InvestmentMath.CashMovement(x), x.Type, x.Id)));
        if (closing.Quantity > 0)
        {
            var value = prices.SingleOrDefault(x => x.Date == end);
            if (value == null) return Fail("ValuationMissing", flows.ToArray());
            flows.Add(new(end, closing.Quantity * value.Price, "ClosingValue", value.Id));
        }
        return new(InvestmentReturns.Xirr(flows.Select(x => new DatedInvestmentCashFlow(x.Date, x.Amount)), ct), flows.ToArray(), policy);
    }
}
