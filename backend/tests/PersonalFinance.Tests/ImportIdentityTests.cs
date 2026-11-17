using System.Text.Json.Nodes;
using PersonalFinance.Api.Application;
using Xunit;
namespace PersonalFinance.Tests;
public sealed class ImportIdentityTests
{
    [Fact]
    public void StrongIdentitySeparatesSourceAccountAndCaseAndPreservesUnicode()
    {
        Assert.Null(FinanceService.ImportIdentityKey("a", "CSV", " "));
        Assert.Equal(FinanceService.ImportIdentityKey("a", "CSV", "中文-ID"), FinanceService.ImportIdentityKey("a", "CSV", " 中文-ID "));
        Assert.NotEqual(FinanceService.ImportIdentityKey("a", "CSV", "编号"), FinanceService.ImportIdentityKey("a", "Alipay", "编号"));
        Assert.NotEqual(FinanceService.ImportIdentityKey("a", "CSV", "ID"), FinanceService.ImportIdentityKey("b", "CSV", "ID"));
        Assert.NotEqual(FinanceService.ImportIdentityKey("a", "CSV", "ID"), FinanceService.ImportIdentityKey("a", "CSV", "id"));
    }
    [Fact]
    public void CoreSignatureNormalizesDecimalAndInstantAndExcludesClassification()
    {
        var a = JsonNode.Parse("""{"accountId":"a","currency":"CNY","type":"Expense","amount":"25.00","occurredAt":"2034-02-01T12:30:20+08:00","categoryId":"food"}""")!;
        var b = a.DeepClone(); b["amount"] = "25"; b["occurredAt"] = "2034-02-01T04:30:20Z"; b["categoryId"] = "other"; b["note"] = "编辑备注";
        Assert.Equal(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
        b["amount"] = "26"; Assert.NotEqual(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
        b["amount"] = "25"; b["type"] = "Income"; Assert.NotEqual(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
        b["type"] = "Expense"; b["toAccountId"] = "other-account"; Assert.NotEqual(FinanceService.ImportCoreSignature(a), FinanceService.ImportCoreSignature(b));
    }
}
