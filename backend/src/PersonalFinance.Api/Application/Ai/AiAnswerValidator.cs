using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace PersonalFinance.Api.Application.Ai;

public static class AiAnswerValidator
{
    private static readonly Regex Numbers = new(@"(?<![A-Za-z])[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?", RegexOptions.CultureInvariant);
    // A conservative value check, not a semantic proof. The UI always exposes authoritative evidence.
    public static (string Answer, bool Verified) Validate(string answer, IReadOnlyList<AiEvidence> sources)
    {
        if (sources.Count == 0 && (Numbers.IsMatch(answer) || Regex.IsMatch(answer, "你的.*(余额|收入|支出|净资产|还款|工资)|您.*(余额|收入|支出|净资产|还款|工资)")))
            return ("当前未取得权威财务查询结果，无法核实账本金额。请明确期间、币种并授权所需查询，或查看原财务报表。", false);
        // Read scalar values, not digits embedded in UUIDs, timestamps, labels or metadata.
        var allowed = new HashSet<decimal>();
        void Read(JsonNode? node, string key = "") {
            if (key.EndsWith("Id", StringComparison.OrdinalIgnoreCase) || key.Equals("version", StringComparison.OrdinalIgnoreCase)) return;
            if (node is JsonObject obj) { foreach (var pair in obj) Read(pair.Value, pair.Key); }
            else if (node is JsonArray array) { foreach (var item in array) Read(item, key); }
            else if (node is JsonValue value && Parse(value.ToString()) is { } number) allowed.Add(number);
        }
        foreach (var source in sources) Read(source.Data);
        bool unavailableReturn=false;
        void InspectReturns(JsonNode? node){
            if(node is JsonObject obj){
                if(obj["xirr"] is JsonObject rate&&rate["status"]?.ToString()!="Success")unavailableReturn=true;
                foreach(var pair in obj){if(pair.Key is "returns" or "investmentReturns"&&pair.Value is JsonObject evidence&&evidence["status"]?.ToString()!="Available")unavailableReturn=true;InspectReturns(pair.Value);}
            }else if(node is JsonArray array)foreach(var item in array)InspectReturns(item);
        }
        foreach(var source in sources)InspectReturns(source.Data);
        if(unavailableReturn&&Regex.Matches(answer,@"(?:XIRR|IRR|收益率|annualized return)[^\n。!?]{0,32}?(?<![\d.])0(?:\.0+)?\s*[%％]",RegexOptions.IgnoreCase).Any(m=>!Regex.IsMatch(m.Value,@"不代表|不等于|不是|并非|不能|not|isn't",RegexOptions.IgnoreCase)))
            return("收益率数据缺失或计算未成功，不能将其解释为0%。请核对下方权威计算状态。",false);
        var text = Regex.Replace(answer, @"(?m)^\s*(?:[-*>#]\s*)*\d{1,3}(?:[.)](?=\s)|、)\s*", "");
        // A model may abbreviate a scoped date range as 2026年10月1日至31日.
        // Exclude only complete, valid ranges contained in one source, never bare numbers.
        text = Regex.Replace(text, @"(?<!\d)(\d{4})年(\d{1,2})月(\d{1,2})日?(?:至|到|—|–|~|～)(?:(\d{1,2})月)?(\d{1,2})日", m => {
            var year = int.Parse(m.Groups[1].Value); var month = int.Parse(m.Groups[2].Value);
            var endMonth = m.Groups[4].Success ? int.Parse(m.Groups[4].Value) : month;
            if (!DateOnly.TryParseExact($"{year:0000}-{month:00}-{int.Parse(m.Groups[3].Value):00}", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first) ||
                !DateOnly.TryParseExact($"{year:0000}-{endMonth:00}-{int.Parse(m.Groups[5].Value):00}", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var last) || first > last) return m.Value;
            return sources.Any(s => DateOnly.TryParse(s.Start, out var start) && DateOnly.TryParse(s.End, out var end) && first >= start && last <= end) ? "" : m.Value;
        });
        text = Regex.Replace(text, @"\d{4}[-年/]\d{1,2}[-月/]\d{1,2}日?", m => {
            var parts = Regex.Matches(m.Value, @"\d+").Select(x => int.Parse(x.Value)).ToArray();
            if (!DateOnly.TryParse($"{parts[0]:0000}-{parts[1]:00}-{parts[2]:00}", out var date)) return m.Value;
            return sources.Any(s => DateOnly.TryParse(s.Start, out var start) && DateOnly.TryParse(s.End, out var end) && date >= start && date <= end || date == DateOnly.FromDateTime(s.QueriedAt.ToOffset(TimeSpan.FromHours(8)).DateTime)) ? "" : m.Value;
        });
        // Month headings and list markers describe structure, not financial values.
        foreach (var source in sources) {
            if (DateOnly.TryParse(source.Start, out var start) && DateOnly.TryParse(source.End, out var end)) {
                text = Regex.Replace(text, @"(?<!\d)(\d{4})年(\d{1,2})月", m => int.Parse(m.Groups[1].Value) == start.Year && int.Parse(m.Groups[2].Value) == start.Month && start.Year == end.Year && start.Month == end.Month ? "" : m.Value);
            }
        }
        if (sources.Count > 0 && Numbers.Matches(text).Any(m => {
            if (Parse(m.Value) is not { } number) return true;
            var suffix = text[(m.Index + m.Length)..].TrimStart();
            if (suffix.StartsWith('%') || suffix.StartsWith('％')) return !allowed.Contains(number) && !allowed.Contains(number / 100m);
            var scale = suffix.StartsWith('亿') ? 100000000m : suffix.StartsWith('万') ? 10000m : suffix.StartsWith('千') ? 1000m : 1m;
            // Allow explicit display precision, including values written in ten-thousands.
            var precision = m.Value.Contains('.') ? m.Value.Length - m.Value.IndexOf('.') - 1 : 0;
            return !allowed.Any(value => precision <= 28 && decimal.Round(value / scale, precision, MidpointRounding.AwayFromZero) == number);
        }))
            return ("模型解释包含本次查询无法核实的数值，已拦截该解释。请查看下方权威财务数据及明细入口，或缩小问题范围重新提问。", false);
        return (answer, sources.Count > 0);
    }
    public static (string Answer, bool Verified) Resolve(string answer, IReadOnlyList<AiEvidence> sources, string language, bool preferSummary = false)
    {
        var validated = Validate(answer, sources);
        if ((!preferSummary && validated.Verified) || sources.Count == 0) return validated;
        var summaries = sources.Where(s => s.Tool == "GetIncomeExpenseSummary" && s.Data is JsonObject).Select(s => {
            var data = s.Data!;
            if (Parse(data["income"]?.ToString() ?? "") is not { } income || Parse(data["expense"]?.ToString() ?? "") is not { } expense) return null;
            string Amount(decimal value) => value.ToString("N2", CultureInfo.InvariantCulture) + " " + s.Currency;
            var scope = s.AccountIds == null ? (language == "en" ? "Personal ledger" : "个人账本") : (language == "en" ? "Selected accounts" : "所选账户");
            return language == "en" ? $"{s.Start} — {s.End} · {scope}\nIncome: {Amount(income)}\nExpenses: {Amount(expense)}\nSurplus: {Amount(income - expense)}" : $"{s.Start} — {s.End} · {scope}\n收入：{Amount(income)}\n支出：{Amount(expense)}\n结余：{Amount(income - expense)}";
        }).Where(x => x != null).ToArray();
        if (summaries.Length == 0) return validated;
        return ((language == "en" ? "Saved ledger query results:\n\n" : "当时查询的账本结果：\n\n") + string.Join("\n\n", summaries), true);
    }
    public static string? DisplaySavedAnswer(string? answer)
    {
        const string zh = "模型解释未采用，以下为账本服务计算的实际结果：";
        const string en = "The model explanation was not used. These figures were calculated by the ledger service:";
        if (answer?.StartsWith(zh, StringComparison.Ordinal) == true) return "当时查询的账本结果：" + answer[zh.Length..];
        if (answer?.StartsWith(en, StringComparison.Ordinal) == true) return "Saved ledger query results:" + answer[en.Length..];
        return answer;
    }
    private static decimal? Parse(string text) => decimal.TryParse(text, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowThousands, CultureInfo.InvariantCulture, out var value) ? value : null;
}
