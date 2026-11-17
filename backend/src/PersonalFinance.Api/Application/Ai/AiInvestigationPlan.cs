using System.Text.Json;
using System.Text.RegularExpressions;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiPlannedRead(string Name, string Arguments);
public static class AiInvestigationPlan
{
    public static bool Deep(string question) => Regex.IsMatch(question, "分析|为什么|为何|报告|洞察|对比|排除|剔除|财务状况|analysis|analy[sz]e|why|report|compare|excluding|insights", RegexOptions.IgnoreCase);
    public static AiPlannedRead[] Monthly(string question, string[] history, DateOnly today, bool restricted, string[] accountIds)
    {
        if (!Deep(question)) return [];
        if (Regex.IsMatch(question, "年度|全年|滚动|最近|过去|半年|annual|yearly|rolling|last \\d+ days", RegexOptions.IgnoreCase)) return [];
        var lines = question.Replace("\r\n", "\n").Split('\n');
        if (lines.Length >= 4 && lines[2] is "我的问题：" or "My question:") {
            try {
                if (System.Text.Json.Nodes.JsonNode.Parse(lines[1])?["filters"] is System.Text.Json.Nodes.JsonObject filters && filters.Any(p => p.Key != "currency")) return [];
            } catch (JsonException) { return []; }
        }
        var text = string.Join('\n', history.TakeLast(2).Select(h => h.Split("；交易ID=", StringSplitOptions.None)[0])) + "\n" + question;
        const string monthPattern = @"(?<![A-Za-z0-9-])(\d{4})[-年](0?[1-9]|1[0-2])(?:月|(?=-|[^\d]|$))";
        var explicitMonths = Regex.Matches(question, monthPattern);
        // Never turn an explicit multi-month or partial-month range into a
        // first-month report. Let the normal tool planner retain that scope.
        if (explicitMonths.Select(m => m.Groups[1].Value + "-" + int.Parse(m.Groups[2].Value)).Distinct().Count() > 1) return [];
        var dates = Regex.Matches(question, @"(?<![0-9])\d{4}-\d{2}-\d{2}(?![0-9])").Select(m => DateOnly.TryParseExact(m.Value, "yyyy-MM-dd", out var d) ? (DateOnly?)d : null).Where(d => d.HasValue).Select(d => d!.Value).Distinct().ToArray();
        if (dates.Length >= 2 && (dates[0].Day != 1 || dates[1] != new DateOnly(dates[0].Year, dates[0].Month, 1).AddMonths(1).AddDays(-1))) return [];
        var matches = explicitMonths.Count > 0 ? explicitMonths : Regex.Matches(text, monthPattern);
        var month = new DateOnly(today.Year, today.Month, 1);
        if (matches.Count > 0) {
            var m = explicitMonths.Count > 0 ? matches[0] : matches[^1];
            if (!int.TryParse(m.Groups[1].Value, out var y) || !int.TryParse(m.Groups[2].Value, out var n) || y is < 1901 or > 9997 || n is < 1 or > 12) return [];
            month = new(y, n, 1);
        } else if (!Regex.IsMatch(text, "本月|这个月|this month|月度|monthly", RegexOptions.IgnoreCase)) return [];
        if (Regex.IsMatch(question, "上月|上个月|last month", RegexOptions.IgnoreCase) && !Regex.IsMatch(question, "对比|比较|compare", RegexOptions.IgnoreCase)) month = month.AddMonths(-1);
        if (month > today) return [];
        var end = month.AddMonths(1).AddDays(-1); if (end > today) end = today;
        var currencies = Regex.Matches(text, @"\b(?:CNY|USD|EUR|HKD|JPY|GBP|AUD|CAD|SGD|CHF)\b", RegexOptions.IgnoreCase);
        var currency = currencies.Count > 0 ? currencies[^1].Value.ToUpperInvariant() : "";
        if (currency == "") currency = "CNY";
        string Args(object value) {
            var node = JsonSerializer.SerializeToNode(value, FinanceService.Json)!.AsObject();
            foreach (var key in node.Where(p => p.Value == null).Select(p => p.Key).ToArray()) node.Remove(key);
            return node.ToJsonString();
        }
        var plan = new List<AiPlannedRead>();
        if (!restricted) plan.Add(new("GetFinancialReport", Args(new { start = month.ToString("yyyy-MM-dd"), end = month.AddMonths(1).AddDays(-1).ToString("yyyy-MM-dd"), currency })));
        // Aggregate the entire selected scope once. Detail sampling of the first accounts
        // must never turn one account's totals into the totals for all selected accounts.
        plan.Add(new("GetIncomeExpenseSummary", Args(new { start = month.ToString("yyyy-MM-dd"), end = end.ToString("yyyy-MM-dd"), currency })));
        plan.Add(new("CompareFinancialPeriods", Args(new AgentComparison(month.ToString("yyyy-MM-dd"), month.AddMonths(1).AddDays(-1).ToString("yyyy-MM-dd"), currency))));
        foreach (var account in restricted ? accountIds.Take(3).Select(x => (string?)x) : new string?[] { null }) {
            plan.Add(new("SearchTransactions", Args(new AgentQuery(month.ToString("yyyy-MM-dd"), end.ToString("yyyy-MM-dd"), currency, account, PageSize: 10, Type: "Expense", Sort: "amount:desc"))));
        }
        return plan.ToArray();
    }
}
