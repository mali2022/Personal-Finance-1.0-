using System.Text.Json;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using Xunit;
namespace PersonalFinance.Tests;
public class SpendingApprovalSchemaTests
{
    static ApprovalEvaluation Valid => new("1.0", "APPROVED", "可以考虑购买", ["资金条件满足", "使用场景明确"], ["满足需要"], ["可以暂缓"], ["保留现金"], ["核实价格"], [], ["意见仅供参考"], 0);
    [Theory]
    [InlineData("APPROVED")][InlineData("CONDITIONAL_APPROVAL")][InlineData("DEFERRED")][InlineData("NOT_RECOMMENDED")][InlineData("NEEDS_INFORMATION")]
    public void FiveVerdictsAccepted(string verdict) => Assert.Equal(verdict, SpendingApprovalAi.ValidateEvaluation(JsonSerializer.Serialize(Valid with { Verdict = verdict }, FinanceService.Json)).Verdict);
    [Theory]
    [InlineData("not json")][InlineData("{}")][InlineData("null")]
    public void InvalidOutputRejected(string raw) => Assert.Throws<ApiException>(() => SpendingApprovalAi.ValidateEvaluation(raw));
    [Fact] public void FabricatedMoneyRejected() => Assert.Throws<ApiException>(() => SpendingApprovalAi.ValidateEvaluation(JsonSerializer.Serialize(Valid with { Summary = "你还有999999元" }, FinanceService.Json)));
    [Fact] public void InvalidVerdictRejected() => Assert.Throws<ApiException>(() => SpendingApprovalAi.ValidateEvaluation(JsonSerializer.Serialize(Valid with { Verdict = "PURCHASED" }, FinanceService.Json)));
    [Fact] public void FingerprintIgnoresClockButDetectsMoney()
    {
        var a = JsonSerializer.SerializeToElement(new { capturedAt = "one", cash = 10, forecast = new { calculatedAt = "one", minimum = 2 } });
        var b = JsonSerializer.SerializeToElement(new { capturedAt = "two", cash = 10, forecast = new { calculatedAt = "two", minimum = 2 } });
        Assert.Equal(SpendingApprovalAi.EvidenceFingerprint(a), SpendingApprovalAi.EvidenceFingerprint(b));
        Assert.NotEqual(SpendingApprovalAi.EvidenceFingerprint(a), SpendingApprovalAi.EvidenceFingerprint(JsonSerializer.SerializeToElement(new { cash = 9 })));
    }
    [Fact] public void SummaryConsentExcludesDetails()
    {
        var source = JsonSerializer.SerializeToElement(new { currency = "CNY", history = new[] { new { id = "private-transaction", amount = 12 } }, forecast = new { minimum = "10.00", events = new[] { "private-event" }, accounts = new[] { "private-account" } } });
        var summary = SpendingApprovalAi.AuthorizedEvidence(source, false).GetRawText();
        Assert.DoesNotContain("private-", summary); Assert.DoesNotContain("history", summary); Assert.Contains("minimum", summary);
        Assert.Contains("private-transaction", SpendingApprovalAi.AuthorizedEvidence(source, true).GetRawText());
    }
}
