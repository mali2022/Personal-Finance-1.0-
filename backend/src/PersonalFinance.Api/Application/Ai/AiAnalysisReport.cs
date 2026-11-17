using System.Globalization;
using System.Text.Json.Nodes;
namespace PersonalFinance.Api.Application.Ai;

public sealed record AiMetric(string Key, string Label, string Value, string Currency, string EvidenceId);
public sealed record AiFinding(string Title, string Text, string Status, string[] EvidenceIds, string? FollowUp = null, string Priority = "attention");
public sealed record AiSeriesPoint(string Label, string Income, string Expense);
public sealed record AiCategory(string Id, string Label, string Amount, string EvidenceId);
public sealed record AiFollowUp(string Label, string Prompt);
public sealed record AiNarrative(string ExecutiveSummary, AiFinding[] Insights, AiFinding[] Recommendations, string[] Limitations);
public sealed record AiAnalysisReport(int SchemaVersion, string ReportTitle, string ReportType, string ReportingPeriod,
    DateTimeOffset GeneratedAt, DateTimeOffset? DataAsOf, string Currency, string ExecutiveSummary,
    AiMetric[] KeyMetrics, AiFinding[] Insights, AiFinding[] Anomalies, AiCategory[] CategoryBreakdown,
    AiSeriesPoint[] TrendSeries, AiFinding[] Recommendations, string Confidence, string[] Limitations, AiFollowUp[] FollowUpActions);

// Financial values are projected from server evidence, never from model-supplied chart JSON.
// Model prose retains a separate verification status; value matching is not proof of causality.
public static class AiAnalysisReports
{
    public static AiAnalysisReport WithNarrative(AiAnalysisReport report, AiNarrative narrative, IReadOnlyList<AiEvidence> sources)
    {
        AiFinding Check(AiFinding finding, bool recommendation) {
            var ids = finding.EvidenceIds.Distinct().Where(id => id.Length > 1 && id[0] == 'e' && int.TryParse(id[1..], out var i) && i >= 0 && i < sources.Count && sources[i].Tool != "ToolFailure").ToArray();
            var refs = ids.Select(id => sources[int.Parse(id[1..])]).ToArray();
            var supported = refs.Length > 0 && AiAnswerValidator.Validate(finding.Text, refs).Verified;
            return finding with { Status = recommendation && supported ? "recommendation" : supported ? "supported" : "unverified", EvidenceIds = ids,
                Priority = finding.Priority is "urgent" or "long-term" ? finding.Priority : "attention" };
        }
        return report with { ExecutiveSummary = AiAnswerValidator.Validate(narrative.ExecutiveSummary, sources.Where(s => s.Tool != "ToolFailure").ToArray()).Verified ? narrative.ExecutiveSummary : report.ExecutiveSummary,
            Insights = report.Insights.Where(i => i.Status == "fact").Concat(narrative.Insights.Select(i => Check(i, false))).ToArray(),
            Recommendations = narrative.Recommendations.Select(i => Check(i, true)).ToArray(),
            Limitations = report.Limitations.Concat(narrative.Limitations.Select(AiPrivacyText.Sanitize)).Distinct().ToArray() };
    }
    private static string? Amount(JsonNode? n) => decimal.TryParse(n?.ToString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var d)
        ? d.ToString("0.00", CultureInfo.InvariantCulture) : null;
    public static AiAnalysisReport Build(string answer, IReadOnlyList<AiEvidence> sources, bool verified, string language = "zh-CN")
    {
        var en = language == "en";
        var main = sources.Select((s, i) => (s, i)).FirstOrDefault(x => x.s.Tool is "GetFinancialReport" or "GetIncomeExpenseSummary");
        var data = main.s?.Data;
        var metrics = data?["metrics"] ?? data;
        var currency = main.s?.Currency ?? sources.FirstOrDefault(s => !string.IsNullOrEmpty(s.Currency))?.Currency ?? "CNY";
        var cards = new List<AiMetric>();
        void Metric(string key, string label, JsonNode? value) { if (Amount(value) is { } amount) cards.Add(new(key, label, amount, currency, "e" + main.i)); }
        Metric("income", en ? "Income" : "收入", metrics?["income"]);
        Metric("expense", en ? "Expenses" : "支出", metrics?["expense"]);
        if (Amount(metrics?["income"]) is { } income && Amount(metrics?["expense"]) is { } expense)
            Metric("surplus", en ? "Income less expenses" : "收支结余", JsonValue.Create(decimal.Parse(income, CultureInfo.InvariantCulture) - decimal.Parse(expense, CultureInfo.InvariantCulture)));
        var limits = new List<string> { en ? "Original currency; transfers and debt principal are not consumption. Refunds and fees follow ledger rules. Income less expenses is not liquid cash flow." : "按原币及账本统计口径；内部转账、借贷本金不算消费。退款和手续费遵循账本规则；收支结余不等于可用现金流。" };
        if (sources.Any(s => s.Truncated)) limits.Add(en ? "Some evidence is paged or truncated; do not recompute totals from a page." : "部分依据经过分页或截断，不能从一页明细重算全量指标。");
        if (sources.Any(s => s.Tool == "ToolFailure")) limits.Add(en ? "Some queries failed; the report is partial." : "部分查询失败，报告只覆盖已成功取得的依据。");
        if (sources.Count == 0) limits.Add(en ? "No ledger evidence was obtained." : "尚未取得账本依据。");
        if (AiEvidenceConsistency.Conflict(sources) != null) limits.Add(en ? "Conflicting snapshots remain; values were not merged." : "存在冲突快照，已保留各次查询及口径；数值未强行合并。");
        var summaries = sources.Where(s => s.Tool == "GetIncomeExpenseSummary").ToArray();
        var current = summaries.FirstOrDefault();
        if (current != null) foreach (var other in summaries.Skip(1).Where(s => s.Start == current.Start && s.End == current.End && s.Currency == current.Currency &&
            (s.AccountIds ?? []).Order().SequenceEqual((current.AccountIds ?? []).Order()))) {
            if (Amount(other.Data?["income"]) != Amount(current.Data?["income"]) || Amount(other.Data?["expense"]) != Amount(current.Data?["expense"]))
                limits.Add(en ? "Conflicting snapshots detected for the same period and scope. Refresh the investigation." : "相同周期与范围出现冲突快照，请刷新调查；本报告未合并冲突数值。");
        }
        var categories = (data?["categories"] as JsonArray ?? []).OfType<JsonObject>().Where(c => Amount(c["amount"]) != null && c["parentId"] == null)
            .OrderByDescending(c => decimal.Parse(Amount(c["amount"])!, CultureInfo.InvariantCulture)).Take(12).Select(c => new AiCategory(c["categoryId"]?.ToString() ?? c["id"]?.ToString() ?? "", c["label"]?.ToString() ?? c["categoryId"]?.ToString() ?? (en ? "Category" : "分类"), Amount(c["amount"])!, "e" + main.i)).ToArray();
        var points = (data?["points"] as JsonArray ?? []).OfType<JsonObject>().Where(p => Amount(p["income"]) != null && Amount(p["expense"]) != null)
            .Take(60).Select(p => new AiSeriesPoint(p["period"]?.ToString() ?? p["date"]?.ToString() ?? "", Amount(p["income"])!, Amount(p["expense"])!)).ToArray();
        var findings = new List<AiFinding>();
        if (cards.Count > 0) findings.Add(new(en ? "Ledger totals" : "账本汇总", en ? "Values above are calculated by the ledger service. Open the evidence for period and accounting definitions." : "以上金额由账本服务计算，可展开依据查看期间和统计口径。", "fact", ["e" + main.i]));
        if (!string.IsNullOrWhiteSpace(answer)) findings.Add(new(en ? "Analysis" : "变化解释", answer, verified ? "supported" : "unverified", sources.Select((_, i) => "e" + i).ToArray()));
        var anomalies = new List<AiFinding>();
        foreach (var source in sources.Select((s, i) => (s, i)).Where(x => x.s.Tool == "GetTransactionDetail").Take(3))
            anomalies.Add(new(en ? "Transaction reviewed" : "已追踪交易", en ? "Transaction details were retrieved. A large amount alone does not establish duplication, misclassification or a one-off cause." : "已读取交易详情。金额较大本身不能证明重复、误分类或一次性原因。", "fact", ["e" + source.i], en ? "Check related transactions and compare the same period." : "继续核对关联交易及历史同期。"));
        var period = main.s == null ? "" : main.s.Start + " — " + main.s.End;
        var dataAsOf = sources.Count == 0 ? (DateTimeOffset?)null : sources.Min(s => s.QueriedAt);
        if (DateTimeOffset.TryParse(data?["endExclusive"]?.ToString(), CultureInfo.InvariantCulture, DateTimeStyles.None, out var cutoff) && cutoff < dataAsOf) {
            dataAsOf = cutoff;
            limits.Add(en ? "The reporting period is a natural month/year; values stop at the displayed cutoff. Comparisons use the same elapsed duration for an incomplete period." : "报告按自然月/年展示，实际数据截至所示时点；未结束期间按同等已过时长比较。");
        }
        return new(1, en ? "Financial analysis" : "财务分析报告", "financial-analysis", period, DateTimeOffset.UtcNow,
            dataAsOf, currency, en ? "Evidence and interpretation are presented separately." : "自动调查结果与解释分项呈现，请结合数据覆盖范围阅读。", cards.ToArray(), findings.ToArray(), anomalies.ToArray(), categories, points,
            [new(en ? "Review the largest contributions" : "优先核对主要变化", en ? "Use the follow-up actions to inspect contributing transactions before changing your budget." : "通过深入分析核对主要交易与可比上期，再决定是否调整预算。", "recommendation", [])],
            sources.Count == 0 ? "unavailable" : limits.Count > 1 ? "partial" : "evidence-backed", limits.ToArray(),
            [new(en ? "Trace large expenses" : "追踪大额支出", en ? "Continue for the same period, currency and accounts: inspect the largest expenses and related transactions; compare the same elapsed days." : "继续当前期间、币种和账户范围：追踪最大支出及关联交易，并与上月同期对比。"),
             new(en ? "Exclude the largest expense" : "剔除最大支出后呢", en ? "For the same period and currency, calculate expenses excluding the largest expense. Use decimal calculations and explain refunds and fees." : "保持当前周期、币种和统计口径，测算排除最大一笔支出后的结果；核对其退款、手续费和分录，不把单页流水相加作为全量。")]);
    }
}
