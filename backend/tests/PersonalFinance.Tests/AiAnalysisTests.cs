using System.Text.Json;
using System.Text.Json.Nodes;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Domain;
using Xunit;

public sealed class AiAnalysisTests
{
    private static AiEvidence Summary(string json, string currency = "CNY", bool truncated = false) => new("GetIncomeExpenseSummary", "2026-10-01", "2026-10-28", currency,
        "原币，不含转账，退款冲减费用", "FinanceService.Report", "/reports", DateTimeOffset.UtcNow, JsonNode.Parse(json), truncated);
    [Fact] public void PersonalReadsAreDefaultButGlobalOptOutAndFamilyConsentRemainEffective()
    {
        var p = AiPrivacyService.Effective(new() { Enabled = true });
        Assert.True(p.AllowSummary && p.AllowDetails && p.AllowPayroll); Assert.False(p.AllowFamily);
        Assert.False(AiPrivacyService.Effective(new()).Enabled);
        Assert.False(AiPrivacyService.Effective(new() { Enabled = true, PersonalReadAccess = false }).AllowDetails);
    }
    [Fact] public void ReadOnlyRegistryCannotAdvertiseFinancialWrites()
    {
        var p = AiPrivacyService.Effective(new() { Enabled = true });
        var definitions = AiAgentTools.Definitions(p, new("u", "r", "l", [], false, "zh-CN", "Asia/Shanghai"), true);
        var names = definitions.Select(d => d!["function"]!["name"]!.ToString()).ToArray();
        Assert.Contains("SearchTransactions", names); Assert.Contains("AnalyzeExpenseExclusion", names); Assert.Contains("GetReconciliationEvidence", names);
        Assert.DoesNotContain(names, name => AiAgentTools.Registry.Any(t => t.Name == name && t.Write));
        Assert.All(definitions, definition => Assert.Equal("object", definition!["function"]!["parameters"]!["type"]!.GetValue<string>()));
    }
    [Theory]
    [InlineData("2026-10-28", "2026-09-28")]
    [InlineData("2026-03-31", "2026-02-28")]
    [InlineData("2024-03-20", "2024-02-20")]
    public void MonthlyInvestigationUsesComparableElapsedDays(string today, string expected)
    {
        var plan = AiInvestigationPlan.Monthly("分析本月财务状况", [], DateOnly.Parse(today), false, []);
        Assert.Equal(4, plan.Length);
        Assert.Equal("CompareFinancialPeriods", plan[2].Name);
        var day = DateOnly.Parse(today);
        var asOf = new DateTimeOffset(day.ToDateTime(new TimeOnly(12, 34)), TimeSpan.FromHours(8));
        var window = AiComparisonWindow.Month(new DateTimeOffset(new DateTime(day.Year, day.Month, 1), TimeSpan.FromHours(8)), asOf);
        Assert.Equal(expected, window.PreviousEnd.AddTicks(-1).ToString("yyyy-MM-dd"));
        if (day.Day < 28) Assert.Equal(window.End.TimeOfDay, window.PreviousEnd.TimeOfDay);
        var p = new AiPrivacySetting { Enabled = true, AllowSummary = true };
        Assert.NotNull(AiFinancialTools.Validate(plan[1].Name, plan[1].Arguments, new(), p));
        Assert.Contains("SearchTransactions", plan.Select(x => x.Name));
    }
    [Fact] public void ScopedInvestigationNeverRequestsGlobalReports()
    {
        var account = Guid.NewGuid().ToString();
        var plan = AiInvestigationPlan.Monthly("分析本月支出", [], new(2026, 10, 28), true, [account]);
        Assert.DoesNotContain(plan, p => p.Name == "GetFinancialReport");
        Assert.All(plan.Where(p => p.Name == "SearchTransactions"), p => Assert.Equal(account, JsonNode.Parse(p.Arguments)!["accountId"]!.ToString()));
        Assert.Contains(plan, p => p.Name == "GetIncomeExpenseSummary" && JsonNode.Parse(p.Arguments)!["accountId"] == null);
    }
    [Fact] public void MetricsAreDecimalEvidenceNotModelClaimsAndCurrenciesDoNotMix()
    {
        var sources = new[] { Summary("""{"income":"90071992547409.91","expense":"0.10"}"""), Summary("""{"income":"999","expense":"888"}""", "USD") };
        var report = AiAnalysisReports.Build("你的收入是999999元", sources, false);
        Assert.Equal("90071992547409.91", report.KeyMetrics.Single(m => m.Key == "income").Value);
        Assert.Equal("90071992547409.81", report.KeyMetrics.Single(m => m.Key == "surplus").Value);
        Assert.All(report.KeyMetrics, m => Assert.Equal("CNY", m.Currency));
        Assert.Contains(report.Insights, i => i.Status == "unverified");
    }
    [Fact] public void ContradictorySnapshotsAndTruncationStayVisible()
    {
        var report = AiAnalysisReports.Build("", [Summary("""{"income":"10","expense":"3"}""", truncated: true), Summary("""{"income":"10","expense":"8"}""")], false);
        Assert.Contains(report.Limitations, l => l.Contains("冲突")); Assert.Contains(report.Limitations, l => l.Contains("分页"));
        Assert.Equal("partial", report.Confidence);
    }
    [Fact] public void StructuredFindingsCannotInventEvidenceOrPromoteGuessesToFacts()
    {
        var sources = new[] { Summary("""{"income":"100","expense":"38"}""") };
        var initial = AiAnalysisReports.Build("", sources, false);
        var report = AiAnalysisReports.WithNarrative(initial, new("没有依据的999元", [new("解释", "重复支出999元", "fact", ["e999"])], [], []), sources);
        var finding = report.Insights.Last(); Assert.Equal("unverified", finding.Status); Assert.Empty(finding.EvidenceIds);
        Assert.DoesNotContain("999", report.ExecutiveSummary);
    }
    [Fact] public void ContextAnchorsKeepOnlyScopeAndIdsAndCanonicalQueriesIgnorePropertyOrder()
    {
        var anchor = AiInvestigationMemory.Anchor([Summary("""{"income":"12345678.99","expense":"38"}""")]);
        Assert.Contains("2026-10-01", anchor); Assert.DoesNotContain("12345678", anchor);
        Assert.Equal(AiInvestigationMemory.Canonical("{\"currency\":\"CNY\",\"page\":1}"), AiInvestigationMemory.Canonical("{\"page\":1,\"currency\":\"CNY\"}"));
    }
    [Fact] public void ReportChartsNeverDoubleCountParentAndChildCategories()
    {
        var source = Summary("""{"categories":[{"id":"parent","label":"生活","parentId":null,"amount":"100"},{"id":"child","parentId":"parent","label":"餐饮","amount":"100"}],"points":[{"period":"2026-10","income":"10","expense":"100"}]}""");
        var report = AiAnalysisReports.Build("", [source], false);
        Assert.Single(report.CategoryBreakdown); Assert.Equal("parent", report.CategoryBreakdown[0].Id); Assert.Single(report.TrendSeries);
    }
    [Fact] public void EmptyEvidenceProducesNoFabricatedMetricsOrCharts()
    {
        var report = AiAnalysisReports.Build("暂无数据", [], false);
        Assert.Empty(report.KeyMetrics); Assert.Empty(report.TrendSeries); Assert.Equal("unavailable", report.Confidence);
    }
    [Fact] public void FollowUpDoesNotMistakeTransactionUuidSegmentsForYearAndMonth()
    {
        const string history = "为什么本月支出这么高？\n[调查定位，仅作范围参考，金额必须重新查询] 2026-10-01 — 2026-10-31 CNY；交易ID=c060f305-8491-4340-8712-020b567890af";
        var plan = AiInvestigationPlan.Monthly("排除最大的一笔交易后呢？", [history], new(2026, 10, 28), false, []);
        Assert.NotEmpty(plan); Assert.Equal("2026-10-01", JsonNode.Parse(plan[0].Arguments)!["start"]!.ToString());
    }
    [Fact] public void PrivacyMaskingPreservesBusinessIdsAndAuthoritativeLargeAmounts()
    {
        const string id = "a1234567-1234-1234-1234-a123456789ab";
        Assert.Equal(id, AiPrivacyText.Sanitize(id));
        Assert.DoesNotContain(id, AiPrivacyText.Sanitize("password=" + id));
        var data = AiAgentTools.Redact(JsonNode.Parse("{\"id\":\"" + id + "\",\"amount\":\"90071992547409.91\",\"note\":\"4111111111111111\"}"), true)!;
        Assert.Equal(id, data["id"]!.ToString()); Assert.Equal("90071992547409.91", data["amount"]!.ToString());
        Assert.DoesNotContain("4111111111111111", data["note"]!.ToString());
    }
}
