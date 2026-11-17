using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;
public sealed record DebtScheduleRow(int Sequence, DateOnly Date, decimal OpeningPrincipal, decimal Principal, decimal Fee, decimal RemainingPrincipal);
public static class DebtScheduleMath
{
    public static List<DebtScheduleRow> Generate(decimal principal, int count, DateOnly firstDate, string repayment, string feeMode, decimal feeParameter)
    {
        FinanceService.Require(principal > 0 && principal == decimal.Round(principal, 2) && count is >= 1 and <= 600 && firstDate.Year is >= 1900 and <= 9900, "计划本金、期数或日期无效");
        FinanceService.Require(repayment is "EqualPrincipal" or "EqualPayment" or "Bullet" && feeMode is "None" or "FixedPerPeriod" or "OriginalPrincipalRate" or "RemainingPrincipalRate" && feeParameter >= 0, "还款或计费规则无效");
        FinanceService.Require(feeMode == "FixedPerPeriod" ? feeParameter <= 1000000000 && feeParameter == decimal.Round(feeParameter, 2) : feeParameter <= 100, "费用参数超出范围");
        FinanceService.Require(repayment != "EqualPayment" || feeMode is "RemainingPrincipalRate" or "None", "固定总额仅支持无息或明确每期剩余本金利率");
        var rate = feeParameter / 100; var remaining = principal;
        var equalPrincipal = decimal.Floor(principal / count * 100) / 100;
        var payment = principal / count;
        if (repayment == "EqualPayment" && rate > 0) {
            decimal discountSum = 0, discount = 1;
            for (var i = 1; i <= count; i++) { discount /= 1 + rate; discountSum += discount; }
            payment = principal / discountSum;
        }
        payment = decimal.Round(payment, 2, MidpointRounding.AwayFromZero);
        var result = new List<DebtScheduleRow>();
        for (var i = 0; i < count; i++) {
            var opening = remaining;
            var fee = decimal.Round(feeMode switch { "FixedPerPeriod" => feeParameter, "OriginalPrincipalRate" => principal * rate, "RemainingPrincipalRate" => opening * rate, _ => 0 }, 2, MidpointRounding.AwayFromZero);
            var part = i == count - 1 ? remaining : repayment switch { "Bullet" => 0, "EqualPayment" => Math.Min(remaining, Math.Max(0, payment - fee)), _ => Math.Min(remaining, equalPrincipal) };
            FinanceService.Require(repayment != "EqualPayment" || i == count - 1 || part > 0 || remaining == 0, "本金过小或费率过高，舍入后无法生成固定总额计划，请用自定义安排");
            remaining -= part; result.Add(new(i + 1, firstDate.AddMonths(i), opening, part, fee, remaining));
        }
        return result;
    }
}
