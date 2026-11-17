namespace PersonalFinance.Api.Application;

public sealed record InvestmentBoundaryMovement(string SourceId, DateOnly Date, string? FromAccountId,
    string? ToAccountId, decimal Amount, string Kind);

/// <summary>Requires caller-verified complete boundary values in one currency. Security and valuation are caller responsibilities.</summary>
public static class InvestmentBoundaryReturns
{
    public static InvestmentReturnAnalysis Calculate(IReadOnlySet<string> accounts, DateOnly start, DateOnly end,
        decimal? openingValue, decimal? closingValue, IEnumerable<InvestmentBoundaryMovement> movements,
        CancellationToken ct = default)
    {
        const string policy = "Account/portfolio boundary; complete cash plus holdings values; opening immediately before start; internal transfers and security trades excluded; fees reduce terminal value, not external withdrawals; Actual/365.";
        InvestmentReturnAnalysis Fail(string status) => new(new(status, null, [], "XIRR-Actual365"), [], policy);
        if (accounts.Count == 0 || start >= end) return Fail("InvalidCashFlow");
        if (openingValue == null || closingValue == null) return Fail("ValuationMissing");
        if (openingValue < 0 || closingValue < 0) return Fail("InvalidCashFlow");
        var flows = new List<InvestmentReturnFlow>();
        if (openingValue > 0) flows.Add(new(start, -openingValue.Value, "OpeningValue", "boundary:opening"));
        foreach (var row in movements.Where(x => x.Date >= start && x.Date <= end).OrderBy(x => x.Date).ThenBy(x => x.SourceId, StringComparer.Ordinal))
        {
            ct.ThrowIfCancellationRequested();
            if (row.Amount < 0) return Fail("InvalidCashFlow");
            var fromInside = row.FromAccountId != null && accounts.Contains(row.FromAccountId);
            var toInside = row.ToAccountId != null && accounts.Contains(row.ToAccountId);
            if (!fromInside && !toInside) continue;
            if (row.Kind is "SecurityTrade" or "InvestmentIncome" or "InvestmentFee") continue;
            if (row.Kind != "Transfer") return Fail("UnclassifiedCashFlow");
            if (fromInside == toInside) continue;
            flows.Add(new(row.Date, toInside ? -row.Amount : row.Amount,
                toInside ? "ExternalContribution" : "ExternalWithdrawal", row.SourceId));
        }
        if (closingValue > 0) flows.Add(new(end, closingValue.Value, "ClosingValue", "boundary:closing"));
        return new(InvestmentReturns.Xirr(flows.Select(x => new DatedInvestmentCashFlow(x.Date, x.Amount)), ct), flows.ToArray(), policy);
    }
}
