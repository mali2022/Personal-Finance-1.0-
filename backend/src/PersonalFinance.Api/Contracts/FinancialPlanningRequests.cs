using System.Text.Json.Serialization;
namespace PersonalFinance.Api.Contracts;

public sealed record AnnualAllocationInput(int Month, string? CategoryId, string Amount);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AnnualBudgetInput(string Total, string Currency, string State, AnnualAllocationInput[] Allocations, string Reason);
public sealed record AnnualMonthlyApply(int Month, string AnnualVersion, string MonthlyVersion, string Reason);
public sealed record CarryoverInput(string SourceMonth, string TargetMonth, string? CategoryId, string Rule, string Parameter, string? Cap, bool CarryOverspend, string? Fingerprint, string TargetVersion, string Reason);
public sealed record PlanningAction(string Action, string Reason);
public sealed record BudgetTemplateInput(string Name, BudgetInput Budget, string State);
public sealed record TemplateApply(string Month, string TemplateVersion, string MonthlyVersion, string Reason);
public sealed record BudgetAlertInput(int[] Thresholds, bool Enabled, bool Silent);
public sealed record BudgetCopyInput(string SourceMonth, string SourceVersion, string TargetMonth, string TargetVersion, string Reason);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record GoalInput(string Name, string Type, string Target, string Currency, DateOnly StartDate, DateOnly TargetDate, string MonthlySaving, int Priority, string State, string Note);
public sealed record GoalAllocationInput(string AccountId, string AccountVersion, string Amount, string Reason, string? Fingerprint);
public sealed record GoalTransferInput(string AccountId, string AccountVersion, string ToGoalId, string ToGoalVersion, string Amount, string Reason);
public sealed record EssentialPolicyInput(string? Id, string? CategoryId, string? TransactionId, string Necessity, string EssentialRate, bool Excluded, string Note);
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record FutureCashFlowInput(string Name, DateOnly ExpectedDate, string Type, string AccountId, string? ToAccountId, string Amount, string Currency, string? ReceivedAmount, string Certainty, string State, string? TransactionId, string? ScenarioId, string Note);
public sealed record ScenarioInput(string Name, string State, string Note);
