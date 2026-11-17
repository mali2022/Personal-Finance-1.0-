using PersonalFinance.Api.Domain;

namespace PersonalFinance.Api.Application;

public sealed record InvestmentReturnAttribution(string Status, decimal? TotalProfit, decimal? NetRealized,
    decimal? UnrealizedChange, decimal? NetDividends, decimal? NetInterest, decimal? IncludedFees, bool Reconciled);

public static class InvestmentReturnAmounts
{
    public static InvestmentReturnAttribution Calculate(IEnumerable<InvestmentTrade> trades,
        InvestmentReturnAnalysis analysis, DateOnly start, DateOnly end)
    {
        if (analysis.Xirr.Status is "ValuationMissing" or "TransferValuationMissing" or "InvalidCashFlow")
            return new(analysis.Xirr.Status, null, null, null, null, null, null, false);
        var rows = trades.Where(x => x.State == "Active" && x.SettlementDate <= end).ToArray();
        if (rows.Length == 0) return new("InsufficientData", null, null, null, null, null, null, false);
        var before = InvestmentMath.Calculate(rows.Where(x => x.SettlementDate < start));
        var closing = InvestmentMath.Calculate(rows);
        var period = rows.Where(x => x.SettlementDate >= start).ToArray();
        decimal NetIncome(string type) => period.Where(x => x.Type == type).Sum(x => InvestmentMath.CashMovement(x));
        var openingValue = -analysis.CashFlows.Where(x => x.Type == "OpeningValue").Sum(x => x.Amount);
        var closingValue = analysis.CashFlows.Where(x => x.Type == "ClosingValue").Sum(x => x.Amount);
        var realized = closing.Realized - before.Realized;
        var unrealizedChange = closingValue - closing.Cost - (openingValue - before.Cost);
        var dividends = NetIncome("Dividend"); var interest = NetIncome("Interest");
        var total = analysis.CashFlows.Sum(x => x.Amount);
        var reconciled = total == realized + unrealizedChange + dividends + interest;
        return new(reconciled ? "Success" : "ReconciliationFailed", total, realized, unrealizedChange,
            dividends, interest, closing.Fees - before.Fees, reconciled);
    }
}
