namespace PersonalFinance.Api.Application;
public sealed record DebtOrderBalance(string Id, decimal Principal, decimal MonthlyRate);
public sealed record DebtOrderResult(string Order, int Months, decimal Interest, decimal RemainingPrincipal);
public static class DebtOrderMath
{
    public static DebtOrderResult Calculate(IReadOnlyList<DebtOrderBalance> sources, decimal budget, int horizon, string order)
    {
        if (budget <= 0 || horizon is < 1 or > 600 || sources.Count is < 1 or > 100 || sources.Any(x => x.Principal < 0 || x.MonthlyRate is < 0 or > 1) || order is not ("HighestRate" or "SmallestBalance")) throw new ArgumentException("还款顺序参数无效");
        var balances = sources.ToDictionary(x => x.Id, x => x.Principal); decimal interestTotal = 0; var months = 0;
        for (; months < horizon && balances.Values.Sum() > 0; months++)
        {
            var interest = sources.Sum(x => decimal.Round(balances[x.Id] * x.MonthlyRate, 2, MidpointRounding.AwayFromZero));
            if (budget <= interest) throw new ArgumentException("预算不能覆盖本期模拟利息，请调整假设");
            interestTotal += interest; var available = budget - interest;
            var sorted = order == "HighestRate" ? sources.OrderByDescending(x => x.MonthlyRate).ThenBy(x => x.Id) : sources.OrderBy(x => balances[x.Id]).ThenBy(x => x.Id);
            foreach (var source in sorted) { var payment = Math.Min(available, balances[source.Id]); balances[source.Id] -= payment; available -= payment; }
        }
        return new(order, months, interestTotal, balances.Values.Sum());
    }
}
