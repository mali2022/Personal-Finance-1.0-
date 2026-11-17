using Xunit;
using PersonalFinance.Api.Application;
using PersonalFinance.Api.Contracts;
using PersonalFinance.Api.Domain;
namespace PersonalFinance.Tests;
public sealed class BatchProtectionTests
{
    private static FinanceTransaction Expense() => new() { Type = "Expense", Entries = [new Entry { Kind = "Expense", Amount = 10 }] };
    [Fact] public void OrdinaryMetadataAllowed() => Assert.Null(FinanceService.BatchProtection(Expense(), new(SetNote: true, Note: "整理"), false, false));
    [Theory] [InlineData("LoanGiven")] [InlineData("LoanReceived")] [InlineData("ReimbursementAdvance")] [InlineData("ReimbursementReceived")] public void SpecializedTransactionsProtected(string type) {var t = Expense(); t.Type = type; Assert.NotNull(FinanceService.BatchProtection(t, new(SetNote: true), false, false));}
    [Fact] public void RefundDependenciesProtected() {Assert.NotNull(FinanceService.BatchProtection(Expense(), new(SetMerchant: true), true, false));var t=Expense();t.Type="Refund";Assert.NotNull(FinanceService.BatchProtection(t,new(SetNote:true),false,false));}
    [Fact] public void SplitCategoryProtectedButNoteAllowed() {var t=Expense();t.Entries.Add(new Entry {Kind="Expense",Amount=5});Assert.NotNull(FinanceService.BatchProtection(t,new(CategoryId:"category"),false,false));Assert.Null(FinanceService.BatchProtection(t,new(SetNote:true),false,false));}
    [Theory] [InlineData("Transfer")] [InlineData("CreditCardPayment")] public void PaymentPrincipalUnaffectedAndClassificationRejected(string type) {var t=Expense();t.Type=type;Assert.NotNull(FinanceService.BatchProtection(t,new(CategoryId:"category"),false,false));Assert.Null(FinanceService.BatchProtection(t,new(SetNote:true),false,false));}
    [Fact] public void ReconciliationAndDeletedProtected() {Assert.NotNull(FinanceService.BatchProtection(Expense(),new(SetNote:true),false,true));var t=Expense();t.Status="Deleted";Assert.NotNull(FinanceService.BatchProtection(t,new(SetNote:true),false,false));}
    [Fact] public void AssetLossReasonRequired() {var t=Expense();t.Type="AssetLoss";Assert.NotNull(FinanceService.BatchProtection(t,new(SetNote:true,Note:" "),false,false));Assert.Null(FinanceService.BatchProtection(t,new(SetNote:true,Note:"损失说明"),false,false));}
}

