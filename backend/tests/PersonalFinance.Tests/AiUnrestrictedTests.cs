using Xunit;
using Microsoft.Extensions.Options;
using PersonalFinance.Api.Application.Ai;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Tests;
public class AiUnrestrictedTests
{
    [Theory][InlineData("ValuationMissing",false)][InlineData("Success",true)]
    public void UnavailableInvestmentRateCannotBorrowAnUnrelatedZero(string status,bool expected){
        var data=System.Text.Json.Nodes.JsonNode.Parse("{\"legacy\":{\"income\":\"0.00\"},\"returns\":{\"status\":\"Available\",\"items\":[{\"xirr\":{\"status\":\""+status+"\",\"rate\":"+(status=="Success"?"0":"null")+"}}]}}");
        var evidence=new AiEvidence("GetInvestmentPerformance","2025-01-01","2026-01-01","CNY","","","/investments/performance",DateTimeOffset.UtcNow,data,false);
        Assert.Equal(expected,AiAnswerValidator.Validate("该投资XIRR为0%",[evidence]).Verified);
    }
    [Fact] public void FullConsentEnablesAllReadPermissionsButIsNotImplicit()
    {
        var legacy = AiPrivacyService.Effective(new AiPrivacySetting { Enabled = true, PersonalReadAccess = false });
        Assert.False(legacy.FullFinancialAccess); Assert.False(legacy.AllowDetails); Assert.False(legacy.AllowFamily);
        var full = AiPrivacyService.Effective(new AiPrivacySetting { Enabled = true, FullFinancialAccess = true });
        Assert.True(full.AllowSummary && full.AllowDetails && full.AllowPayroll && full.AllowFamily && full.AllowRecognitionText);
    }
    [Theory]
    [InlineData(true)] [InlineData(false)]
    public void AdvertisedToolsAreUniqueAcrossFinancialAndAgentRegistries(bool readOnly)
    {
        var privacy = AiPrivacyService.Effective(new AiPrivacySetting { Enabled = true, FullFinancialAccess = true });
        var context = new AiRequestContext("synthetic", "synthetic", "synthetic", [], false, "zh-CN", "Asia/Shanghai");
        var names = AiAgentTools.Definitions(privacy, context, readOnly).Select(t => t!["function"]!["name"]!.ToString()).ToArray();
        Assert.Equal(names.Length, names.Distinct(StringComparer.Ordinal).Count());
        Assert.Single(names, name => name == "GetInvestmentPerformance");
    }
    [Theory]
    [InlineData("综合分析2018-01-01至2026-10-28的财务")]
    [InlineData("分析2026-10-02至2026-10-15的支出")]
    public void MonthlyShortcutCannotReplaceAnExplicitLongOrPartialRange(string question)
        => Assert.Empty(AiInvestigationPlan.Monthly(question, [], new(2026,10,28), false, []));
    [Fact] public void GlobalToolSchemasDoNotInviteUnsupportedAccountArguments()
    {
        var p = AiPrivacyService.Effective(new AiPrivacySetting { Enabled = true, FullFinancialAccess = true });
        foreach (var tool in AiFinancialTools.Definitions(p)) {
            var name = tool!["function"]!["name"]!.ToString();
            Assert.Equal(AiFinancialTools.SupportsAccountScope(name), tool["function"]!["parameters"]!["properties"]!.AsObject().ContainsKey("accountId"));
        }
    }
    [Theory]
    [InlineData("2018-10-31", "2018年10月1日至31日，支出10.00元。", true)]
    [InlineData("2018-10-28", "2018年10月1日至31日，支出10.00元。", false)]
    [InlineData("2018-10-31", "2018年10月1日至31日，支出31.00元。", false)]
    public void ChineseDateAbbreviationsAreScopedAndDoNotAuthorizeInventedAmounts(string end, string answer, bool expected)
    {
        var source = new AiEvidence("GetIncomeExpenseSummary", "2018-10-01", end, "CNY", "synthetic", "FinanceService.Report", "/reports", DateTimeOffset.UtcNow,
            System.Text.Json.Nodes.JsonNode.Parse("{\"expense\":\"10.00\"}"), false);
        Assert.Equal(expected, AiAnswerValidator.Validate(answer, [source]).Verified);
    }
    [Fact] public void DisabledAiDoesNotExpandConsent()
    {
        var disabled = AiPrivacyService.Effective(new AiPrivacySetting { FullFinancialAccess = true });
        Assert.False(disabled.AllowSummary); Assert.False(disabled.AllowDetails);
    }
    [Fact] public async Task LegacyBudgetsAndAbsentPricesDoNotInvalidateConfiguration()
    {
        var service = new AiAgentConfigurationService(null!, Options.Create(new AiOptions()));
        var result = await service.Validate("user", new AiAgentConfiguration {
            TokenBudget = 0, ToolBudget = 0, ModelCallBudget = 0, DailyCostBudget = 0, MonthlyCostBudget = 0 }, default);
        Assert.Null(result.DailyCostBudget); Assert.Null(result.MonthlyCostBudget);
        await new DeepSeekUsageService(null!, Options.Create(new AiOptions { DailyCallLimit = 1 })).CheckLimit("user", default);
    }
    [Fact] public void ConsentInvalidationClearsOnlyCurrentUsersCachedContext()
    {
        using var cache = new AiContextService(); var id = Guid.NewGuid().ToString();
        cache.Save("alice", id, ["private"]); cache.Save("bob", id, ["other"]);
        cache.InvalidateUser("alice");
        Assert.Throws<PersonalFinance.Api.Contracts.ApiException>(() => cache.Read("alice", id));
        Assert.Equal("other", Assert.Single(cache.Read("bob", id)));
    }
    [Fact] public void DetailedNarrativeIsNotRejectedByFormerSectionOrLengthQuotas()
    {
        var report = AiAnalysisReports.Build("分析", [], false);
        var findings = Enumerable.Range(0, 20).Select(_ => new AiFinding("建议", new string('文', 9000), "recommendation", [])).ToArray();
        var result = AiAnalysisReports.WithNarrative(report, new(new string('文', 5000), [], findings, []), []);
        Assert.Equal(20, result.Recommendations.Length);
        Assert.All(result.Recommendations, finding => Assert.Equal("unverified", finding.Status));
    }
    [Fact] public void FiveYearQueryRangeRemainsValid()
    {
        var range = AiAgentTools.DateRange("2018-01-01", "2026-10-28");
        Assert.True(range.End.DayNumber - range.Start.DayNumber > 5 * 365);
    }
}
