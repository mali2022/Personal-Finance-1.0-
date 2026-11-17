using PersonalFinance.Api.Contracts;
namespace PersonalFinance.Api.Application;

public sealed record TimeSegment([property:System.Text.Json.Serialization.JsonConverter(typeof(TimeOffsetConverter))] DateTimeOffset Start, [property:System.Text.Json.Serialization.JsonConverter(typeof(TimeOffsetConverter))] DateTimeOffset End);
public static class TimeAssetMath
{
    public static readonly string[] Categories = ["Work", "Commute", "Learning", "Health", "Family", "Leisure", "Sleep", "Other"];
    public static decimal Seconds(TimeSegment segment, DateTimeOffset start, DateTimeOffset end)
    {
        var a = segment.Start > start ? segment.Start : start;
        var b = segment.End < end ? segment.End : end;
        return b > a ? (decimal)(b - a).TotalSeconds : 0;
    }
    public static decimal UnionSeconds(IEnumerable<TimeSegment> segments, DateTimeOffset start, DateTimeOffset end)
    {
        DateTimeOffset cursor = start; decimal result = 0;
        foreach (var s in segments.OrderBy(s => s.Start)) {
            var a = s.Start > cursor ? s.Start : cursor; var b = s.End < end ? s.End : end;
            if (b > a) { result += (decimal)(b-a).TotalSeconds; cursor = b; }
        }
        return result;
    }
    public static decimal? Percent(decimal numerator, decimal denominator) => denominator > 0 ? decimal.Round(numerator / denominator * 100, 2) : null;
    public static decimal Rate(string method, decimal income, decimal hours, decimal custom)
    {
        FinanceService.Require(method is "LaborIncome" or "DisposableIncome" or "OpportunityCost" or "Custom", "估值方法无效");
        var result = method is "LaborIncome" or "DisposableIncome" ? hours > 0 && income > 0 ? income / hours : throw new ApiException(422,"收入和工时须大于零") : custom;
        FinanceService.Require(result > 0 && result <= 100000000, "时薪须大于零且不超过一亿");
        return decimal.Round(result, 8);
    }
    public static DateTimeOffset Shanghai(DateOnly date) => new(date.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(8));
    public static DateOnly BudgetEnd(string period, DateOnly start) => period switch {
        "Day" => start.AddDays(1), "Week" when start.DayOfWeek == DayOfWeek.Monday => start.AddDays(7),
        "Month" when start.Day == 1 => start.AddMonths(1), _ => throw new ApiException(422,"周预算须从周一开始，月预算须从每月1日开始") };
}
